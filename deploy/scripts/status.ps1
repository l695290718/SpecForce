[CmdletBinding()]
param([switch]$ExternalPostgres)

. (Join-Path $PSScriptRoot "common.ps1")

Assert-DockerReady
Ensure-EnvironmentFile
$environment = Read-EnvironmentFile
$webPort = Assert-DeploymentEnvironment $environment

Write-Output "--- Compose status ---"
Invoke-SpecForgeCompose -Arguments @("ps") -ExternalPostgres:$ExternalPostgres

Write-Output "--- Web health ---"
try {
  $response = Invoke-WebRequest "http://127.0.0.1:$webPort/healthz" -UseBasicParsing -TimeoutSec 5
  Write-Output "web=$($response.StatusCode) $($response.Content)"
} catch {
  Write-Output "web=UNAVAILABLE $($_.Exception.Message)"
}

if (-not $ExternalPostgres) {
  Write-Output "--- PostgreSQL health ---"
  $compose = @(Get-ComposeArguments) + @("exec", "-T", "postgres", "pg_isready", "-U", $environment.POSTGRES_USER, "-d", $environment.POSTGRES_DB)
  & docker @compose
  if ($LASTEXITCODE -ne 0) { Write-Output "postgres=UNAVAILABLE" }
} else {
  Write-Output "postgres=external DATABASE_URL configured"
}

Write-Output "--- Bootstrap state ---"
if (-not $ExternalPostgres) {
  $bootstrap = @(Get-ComposeArguments) + @("exec", "-T", "postgres", "psql", "-U", $environment.POSTGRES_USER, "-d", $environment.POSTGRES_DB, "-At", "-c", 'SELECT "status" || ''|version='' || "version" || ''|counts='' || "counts" || COALESCE(''|error='' || "errorMessage", '''') FROM "DeploymentBootstrap" WHERE "bootstrapKey" = ''specforge-default-bootstrap''')
  & docker @bootstrap
  if ($LASTEXITCODE -ne 0) { Write-Output "bootstrap=UNAVAILABLE" }
} else {
  Write-Output "bootstrap=inspect external DATABASE_URL with psql or the Web health endpoint"
}

Write-Output "--- Governed 3A bootstrap ---"
$threeA = @(Get-ComposeArguments -ExternalPostgres:$ExternalPostgres) + @("ps", "-a", "--format", "json", "three-a-bootstrap")
& docker @threeA

Write-Output "--- Managed boundary ---"
Write-Output "Managed by these scripts: Web, PostgreSQL, first-startup Bootstrap, Knowledge Projector."
Write-Output "Not managed: local port 3000, MCP stdio clients, NebulaGraph."
