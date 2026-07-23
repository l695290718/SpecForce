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
if (-not $bundled.services.web.healthcheck -or -not $bundled.services.postgres.healthcheck) { throw "Both services require health checks." }
if ($bundled.services.postgres.ports) { throw "PostgreSQL must not publish a host port." }
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

if ($ConfigurationOnly) {
  Write-Output "Compose configuration verified."
  exit 0
}

throw "Live verification is not implemented yet."
