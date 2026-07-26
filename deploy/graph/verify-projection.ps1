param(
  [switch]$ConfigurationOnly
)

$ErrorActionPreference = "Stop"

function Assert-Condition([bool]$Condition, [string]$Message) {
  if (-not $Condition) {
    throw $Message
  }
}

function Has-Service($Configuration, [string]$Name) {
  return $null -ne $Configuration.services.$Name
}

function Get-Service($Configuration, [string]$Name) {
  return $Configuration.services.$Name
}

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$baseCompose = Join-Path $repositoryRoot "deploy\\compose.yaml"
$localCompose = Join-Path $repositoryRoot "deploy\\compose.graph-local.yaml"

Assert-Condition (Test-Path -LiteralPath $baseCompose) "Base Compose file is missing."
Assert-Condition (Test-Path -LiteralPath $localCompose) "Local NebulaGraph Compose profile is missing."

$environmentFile = Join-Path ([System.IO.Path]::GetTempPath()) ("specforge-graph-config-" + [guid]::NewGuid().ToString("N") + ".env")
@'
POSTGRES_USER=specforge
POSTGRES_PASSWORD=configuration-check-only
POSTGRES_DB=specforge
SPECFORGE_WEB_PORT=3000
SPECFORGE_GRAPH_GATEWAY_IMAGE=specforge/graph-gateway:configuration-check
SPECFORGE_GRAPH_PROJECTOR_IMAGE=specforge/graph-projector:configuration-check
SPECFORGE_NEBULA_USER=root
SPECFORGE_NEBULA_PASSWORD=configuration-check-only
SPECFORGE_NEBULA_SPACE=specforge_graph
'@ | Set-Content -LiteralPath $environmentFile -Encoding ascii

try {
  $external = docker compose --env-file $environmentFile -f $baseCompose config --format json | ConvertFrom-Json
  $local = docker compose --env-file $environmentFile -f $baseCompose -f $localCompose config --format json | ConvertFrom-Json

  Assert-Condition (-not (Has-Service $external "nebula-metad")) "External-cluster mode must not include Nebula meta service."
  Assert-Condition (-not (Has-Service $external "nebula-graphd")) "External-cluster mode must not include Nebula graph service."
  Assert-Condition (-not (Has-Service $external "graph-gateway")) "External-cluster mode must not include the local graph Gateway."
  Assert-Condition (-not (Has-Service $external "graph-projector")) "External-cluster mode must not include the local Projector."

  foreach ($service in @("nebula-metad", "nebula-storaged", "nebula-graphd", "graph-gateway", "graph-projector")) {
    Assert-Condition (Has-Service $local $service) "Local graph profile is missing $service."
  }
  foreach ($service in @("nebula-metad", "nebula-storaged", "nebula-graphd")) {
    $ports = (Get-Service $local $service).ports
    Assert-Condition ($null -eq $ports -or $ports.Count -eq 0) "$service must not publish a host port."
  }
  $gateway = Get-Service $local "graph-gateway"
  $projector = Get-Service $local "graph-projector"
  Assert-Condition ($gateway.depends_on.postgres.condition -eq "service_healthy") "Gateway must wait for healthy PostgreSQL."
  Assert-Condition ($gateway.depends_on."nebula-graphd".condition -eq "service_healthy") "Gateway must wait for healthy Nebula graphd."
  Assert-Condition ($projector.depends_on.postgres.condition -eq "service_healthy") "Projector must wait for healthy PostgreSQL."
  Assert-Condition ($projector.depends_on."nebula-graphd".condition -eq "service_healthy") "Projector must wait for healthy Nebula graphd."

  Write-Host "NebulaGraph projection configuration assertions passed."
  if (-not $ConfigurationOnly) {
    Write-Host "Live verification is intentionally deferred until the runtime services from Task 4 are available."
  }
} finally {
  Remove-Item -LiteralPath $environmentFile -Force -ErrorAction SilentlyContinue
}
