[CmdletBinding()]
param([switch]$ExternalPostgres)

. (Join-Path $PSScriptRoot "common.ps1")

Assert-DockerReady
Ensure-EnvironmentFile
Invoke-SpecForgeCompose -Arguments @("down", "--remove-orphans") -ExternalPostgres:$ExternalPostgres
Write-Output "SpecForge containers stopped. The PostgreSQL volume was preserved."
