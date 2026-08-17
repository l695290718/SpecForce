[CmdletBinding()]
param(
  [switch]$ConfigurationOnly,
  [switch]$Live
)

$ErrorActionPreference = "Stop"

if ($ConfigurationOnly -eq $Live) {
  throw "Specify exactly one of -ConfigurationOnly or -Live."
}

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$deployDirectory = Join-Path $repositoryRoot "deploy"
$environmentFile = Join-Path $deployDirectory ".env.example"
$composeFile = Join-Path $deployDirectory "compose.yaml"
$externalComposeFile = Join-Path $deployDirectory "compose.external-postgres.yaml"

function Get-ComposeConfiguration([string[]]$ComposeFiles, [string]$EnvFile = $environmentFile) {
  $arguments = @("compose", "--env-file", $EnvFile)
  foreach ($file in $ComposeFiles) {
    $arguments += @("-f", $file)
  }
  $arguments += @("config", "--format", "json")
  $rendered = & docker @arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose config failed." }
  return $rendered | ConvertFrom-Json
}

$bundled = Get-ComposeConfiguration @($composeFile)
if (-not $bundled.services.web.healthcheck -or -not $bundled.services.postgres.healthcheck -or -not $bundled.services.'knowledge-projector'.healthcheck) { throw "Web, PostgreSQL, and Knowledge Projector require health checks." }
if (-not $bundled.services.bootstrap -or $bundled.services.bootstrap.restart -ne "no" -or -not $bundled.services.'three-a-bootstrap' -or $bundled.services.'three-a-bootstrap'.restart -ne "no") { throw "Bootstrap and governed 3A bootstrap must be one-shot services." }
if ($bundled.services.bootstrap.ports -or $bundled.services.'three-a-bootstrap'.ports) { throw "Bootstrap services must not publish a host port." }
if ($bundled.services.web.depends_on.bootstrap.condition -ne "service_completed_successfully" -or $bundled.services.web.depends_on.'three-a-bootstrap'.condition -ne "service_completed_successfully" -or $bundled.services.'knowledge-projector'.depends_on.bootstrap.condition -ne "service_completed_successfully" -or $bundled.services.'three-a-bootstrap'.depends_on.'knowledge-projector'.condition -ne "service_healthy") { throw "Web and Knowledge Projector must wait for the correct bootstrap chain." }
if ($bundled.services.postgres.ports) { throw "PostgreSQL must not publish a host port." }
if ($bundled.services.'knowledge-projector'.ports) { throw "Knowledge Projector must not publish a host port in the default topology." }
if (-not $bundled.volumes.specforge_pgdata) { throw "Missing specforge_pgdata volume." }

$externalEnvironmentFile = Join-Path ([System.IO.Path]::GetTempPath()) "specforge-compose-external-$PID.env"
Copy-Item $environmentFile $externalEnvironmentFile
Add-Content $externalEnvironmentFile "`nDATABASE_URL=postgresql://external:external@external-postgres:5432/specforge?schema=public`nSPECFORGE_EXTERNAL_PG_HOST=external-postgres"
try {
  $external = Get-ComposeConfiguration @($composeFile, $externalComposeFile) $externalEnvironmentFile
} finally {
  Remove-Item $externalEnvironmentFile -Force -ErrorAction SilentlyContinue
}
if ($external.services.postgres) { throw "External PostgreSQL mode must omit the bundled postgres service." }
if (-not $external.services.'knowledge-projector'.environment.DATABASE_URL) { throw "External PostgreSQL mode must configure the Knowledge Projector DATABASE_URL." }
if (-not $external.services.bootstrap.environment.DATABASE_URL) { throw "External PostgreSQL mode must configure the Bootstrap DATABASE_URL." }
if (-not $external.services.'three-a-bootstrap'.environment.DATABASE_URL) { throw "External PostgreSQL mode must configure the governed 3A Bootstrap DATABASE_URL." }

if ($ConfigurationOnly) {
  Write-Output "Compose configuration verified."
  exit 0
}

$deploymentEnvironmentFile = Join-Path $deployDirectory ".env"
if (-not (Test-Path $deploymentEnvironmentFile)) {
  throw "Live verification requires $deploymentEnvironmentFile. Copy deploy/.env.example first."
}

function Invoke-Compose([string[]]$Arguments) {
  & docker compose --env-file $deploymentEnvironmentFile -f $composeFile @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($Arguments -join ' ') failed." }
}

$deploymentEnvironment = @{}
Get-Content $deploymentEnvironmentFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { $deploymentEnvironment[$matches[1]] = $matches[2] }
}
$webPort = if ($deploymentEnvironment.SPECFORGE_WEB_PORT) { $deploymentEnvironment.SPECFORGE_WEB_PORT } else { "3010" }
$databaseUser = $deploymentEnvironment.POSTGRES_USER
$databaseName = $deploymentEnvironment.POSTGRES_DB

Invoke-Compose @("up", "-d", "--build")

function Assert-WebHealth([string]$Stage) {
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest "http://localhost:$webPort/healthz" -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -eq 200) { return }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  throw "Web health check did not pass during $Stage."
}

Assert-WebHealth "initial startup"
$countSql = @'
SELECT count(*) FROM "DesignAsset";
'@
$before = ($countSql | & docker compose --env-file $deploymentEnvironmentFile -f $composeFile exec -T postgres psql -U $databaseUser -d $databaseName -At -f -) | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { throw "Unable to read DesignAsset count before restart." }

Invoke-Compose @("restart", "web")
Assert-WebHealth "web restart"
$after = ($countSql | & docker compose --env-file $deploymentEnvironmentFile -f $composeFile exec -T postgres psql -U $databaseUser -d $databaseName -At -f -) | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) { throw "Unable to read DesignAsset count after restart." }
if ($before.Trim() -ne $after.Trim()) { throw "DesignAsset count changed across Web restart: $before -> $after" }

Write-Output "Live deployment verification passed."
