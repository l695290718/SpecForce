[CmdletBinding()]
param([switch]$ExternalPostgres)

. (Join-Path $PSScriptRoot "common.ps1")

Assert-DockerReady
Ensure-EnvironmentFile
$environment = Read-EnvironmentFile
Assert-DeploymentEnvironment $environment | Out-Null

if ($ExternalPostgres) {
  Write-Output "Bootstrap state is stored in the external DATABASE_URL. Use status.ps1 or psql against that database."
  exit 0
}

$compose = @(Get-ComposeArguments) + @("exec", "-T", "postgres", "psql", "-U", $environment.POSTGRES_USER, "-d", $environment.POSTGRES_DB, "-At", "-c", 'SELECT "status" || ''|version='' || "version" || ''|attempts='' || "attemptCount" || ''|counts='' || "counts" || COALESCE(''|error='' || "errorMessage", '''') FROM "DeploymentBootstrap" WHERE "bootstrapKey" = ''specforge-default-bootstrap''')
& docker @compose
if ($LASTEXITCODE -ne 0) { throw "Unable to read DeploymentBootstrap state." }
