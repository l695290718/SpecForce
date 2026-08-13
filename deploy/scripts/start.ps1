[CmdletBinding()]
param(
  [switch]$ExternalPostgres,
  [switch]$NoBuild
)

. (Join-Path $PSScriptRoot "common.ps1")

Assert-DockerReady
Ensure-EnvironmentFile
$environment = Read-EnvironmentFile
$webPort = Assert-DeploymentEnvironment $environment

$upArguments = @("up", "-d")
if (-not $NoBuild) { $upArguments += "--build" }
Invoke-SpecForgeCompose -Arguments $upArguments -ExternalPostgres:$ExternalPostgres
Wait-ForBootstrap -ExternalPostgres:$ExternalPostgres
Wait-ForWebHealth -Port $webPort

Write-Output "SpecForge is ready: http://localhost:$webPort"
Write-Output "PostgreSQL is authoritative and managed by the selected Compose topology."
Write-Output "Run .\deploy\scripts\status.ps1 for container and database checks."
