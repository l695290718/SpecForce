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
$gatewayDockerfile = Join-Path $repositoryRoot "deploy\\graph-gateway.Dockerfile"
$projectorDockerfile = Join-Path $repositoryRoot "deploy\\graph-projector.Dockerfile"
$gatewayDockerignore = Join-Path $repositoryRoot "deploy\\graph-gateway.Dockerfile.dockerignore"
$projectorDockerignore = Join-Path $repositoryRoot "deploy\\graph-projector.Dockerfile.dockerignore"
$gatewayHealthcheck = Join-Path $repositoryRoot "deploy\\graph\\gateway-healthcheck.go"
$buildScript = Join-Path $repositoryRoot "deploy\\graph\\build-images.ps1"

Assert-Condition (Test-Path -LiteralPath $baseCompose) "Base Compose file is missing."
Assert-Condition (Test-Path -LiteralPath $localCompose) "Local NebulaGraph Compose profile is missing."
Assert-Condition (Test-Path -LiteralPath $gatewayDockerfile) "Graph Gateway Dockerfile is missing."
Assert-Condition (Test-Path -LiteralPath $projectorDockerfile) "Graph Projector Dockerfile is missing."
Assert-Condition (Test-Path -LiteralPath $gatewayDockerignore) "Gateway Dockerfile-specific ignore file is missing."
Assert-Condition (Test-Path -LiteralPath $projectorDockerignore) "Projector Dockerfile-specific ignore file is missing."
Assert-Condition (Test-Path -LiteralPath $gatewayHealthcheck) "Gateway static healthcheck source is missing."
Assert-Condition (Test-Path -LiteralPath $buildScript) "Graph image build script is missing."

$gatewayDockerfileContent = Get-Content -LiteralPath $gatewayDockerfile -Raw
$projectorDockerfileContent = Get-Content -LiteralPath $projectorDockerfile -Raw
Assert-Condition ($gatewayDockerfileContent -match "ARG GO_BUILDER_IMAGE=golang:1\.26\.5-bookworm@sha256:") "Gateway builder must pin the verified Go 1.26 image by digest."
Assert-Condition ($gatewayDockerfileContent.Contains('FROM ${GO_BUILDER_IMAGE} AS builder')) "Gateway must use a separate builder stage."
Assert-Condition ($gatewayDockerfileContent -match "FROM scratch AS runtime") "Gateway must use an immutable scratch runtime."
Assert-Condition ($gatewayDockerfileContent -match "go mod download") "Gateway dependencies must be resolved from go.sum before source compilation."
Assert-Condition ($gatewayDockerfileContent -match "-trimpath") "Gateway build must remove host-specific source paths."
Assert-Condition ($gatewayDockerfileContent -match "graph-gateway-healthcheck") "Gateway image must include its static health probe."
Assert-Condition ($projectorDockerfileContent -match "ARG NODE_IMAGE=node:22\.23\.1-bookworm@sha256:") "Projector must pin its Node 22 Bookworm base image by digest."
Assert-Condition ($projectorDockerfileContent.Contains('FROM ${NODE_IMAGE} AS builder')) "Projector must use a separate builder stage."
Assert-Condition ($projectorDockerfileContent.Contains('FROM ${NODE_IMAGE} AS runtime')) "Projector must use a separate runtime stage."
Assert-Condition ($projectorDockerfileContent -notmatch "apt-get") "Projector must not resolve mutable apt packages during its reproducible build."
Assert-Condition ($projectorDockerfileContent -match "pnpm install --frozen-lockfile") "Projector dependencies must use the frozen lockfile."
Assert-Condition ($projectorDockerfileContent -match "pnpm db:generate") "Projector image must generate Prisma Client."
Assert-Condition ($projectorDockerfileContent -match "apps/graph-projector/dist/main\.js") "Projector image must run the compiled runtime entrypoint."
$buildScriptContent = Get-Content -LiteralPath $buildScript -Raw
Assert-Condition ($buildScriptContent -match "graph-gateway\.Dockerfile") "Build script must build the Gateway image."
Assert-Condition ($buildScriptContent -match "graph-projector\.Dockerfile") "Build script must build the Projector image."
Assert-Condition ($buildScriptContent -match "\[switch\]\`$Pull") "Build script must make base-image refresh explicit."

$environmentFile = Join-Path ([System.IO.Path]::GetTempPath()) ("specforge-graph-config-" + [guid]::NewGuid().ToString("N") + ".env")
@'
POSTGRES_USER=specforge
POSTGRES_PASSWORD=configuration-check-only
POSTGRES_DB=specforge
SPECFORGE_WEB_PORT=3000
SPECFORGE_NEBULA_USER=root
SPECFORGE_NEBULA_PASSWORD=configuration-check-only
SPECFORGE_NEBULA_SPACE=specforge_graph
SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID=enterprise-1
SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID=com.huawei.celon.desiner
SPECFORGE_GRAPH_HEALTH_SCOPE_PATH=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
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
  foreach ($service in @("nebula-metad", "nebula-storaged", "nebula-graphd", "graph-gateway", "graph-projector")) {
    $ports = (Get-Service $local $service).ports
    Assert-Condition ($null -eq $ports -or $ports.Count -eq 0) "$service must not publish a host port."
  }
  $gateway = Get-Service $local "graph-gateway"
  $projector = Get-Service $local "graph-projector"
  Assert-Condition ($null -ne $gateway.build) "Gateway must be built from repository source."
  Assert-Condition ($gateway.build.dockerfile -eq "deploy/graph-gateway.Dockerfile") "Gateway must use its production Dockerfile."
  Assert-Condition ($gateway.pull_policy -eq "build") "Gateway must build the current repository source instead of reusing an old image."
  Assert-Condition ($null -ne $projector.build) "Projector must be built from repository source."
  Assert-Condition ($projector.build.dockerfile -eq "deploy/graph-projector.Dockerfile") "Projector must use its production Dockerfile."
  Assert-Condition ($projector.pull_policy -eq "build") "Projector must build the current repository source instead of reusing an old image."
  Assert-Condition ($null -ne $gateway.healthcheck) "Gateway healthcheck is required."
  Assert-Condition ($null -ne $projector.healthcheck) "Projector healthcheck is required."
  Assert-Condition ($gateway.depends_on.postgres.condition -eq "service_healthy") "Gateway must wait for healthy PostgreSQL."
  Assert-Condition ($gateway.depends_on."nebula-graphd".condition -eq "service_healthy") "Gateway must wait for healthy Nebula graphd."
  Assert-Condition ($projector.depends_on.postgres.condition -eq "service_healthy") "Projector must wait for healthy PostgreSQL."
  Assert-Condition ($projector.depends_on."nebula-graphd".condition -eq "service_healthy") "Projector must wait for healthy Nebula graphd."
  Assert-Condition ($projector.depends_on."graph-gateway".condition -eq "service_healthy") "Projector must wait for a healthy Gateway."

  Write-Host "NebulaGraph projection configuration assertions passed."
  if (-not $ConfigurationOnly) {
    Write-Host "Live verification is intentionally deferred until the runtime services from Task 4 are available."
  }
} finally {
  Remove-Item -LiteralPath $environmentFile -Force -ErrorAction SilentlyContinue
}
