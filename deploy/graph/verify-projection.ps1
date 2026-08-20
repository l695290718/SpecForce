param(
  [switch]$ConfigurationOnly,
  [switch]$Live
)

$ErrorActionPreference = "Stop"

if ($ConfigurationOnly -and $Live) {
  throw "Specify exactly one of -ConfigurationOnly or -Live."
}

if (-not $ConfigurationOnly -and -not $Live) {
  $ConfigurationOnly = $true
}

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

$managedGraphServices = @(
  "nebula-metad",
  "nebula-storaged",
  "nebula-graphd",
  "nebula-bootstrap",
  "graph-gateway",
  "graph-projector"
)

function Assert-RunId([string]$RunId) {
  if ([string]::IsNullOrWhiteSpace($RunId) -or $RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' -or $RunId.ToLowerInvariant() -eq "manual") {
    throw "GRAPH_LIVE_RUN_ID_INVALID: use a generated or explicit non-manual run id."
  }
}

function Get-ManagedComposeProject([string]$RunId) {
  Assert-RunId $RunId
  return "specforge-graph-verify-$RunId"
}

function Get-DotEnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
  if ($null -eq $line) { return $null }
  return (($line -replace "^$([regex]::Escape($Name))=", "").Trim().Trim('"').Trim("'"))
}

function Assert-CanonicalDatabaseUrl([string]$DatabaseUrl, [string]$Code) {
  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { throw "$Code`: database URL is required." }
  if ($DatabaseUrl -match "specforge-graph-verify" -or $DatabaseUrl -notmatch "/specforge_canonical(?:\?|$)") {
    throw "$Code`: database URL must target the canonical specforge_canonical database."
  }
}

function Get-ManagedComposeArgs([string]$ProjectName, [string]$RootEnvFile, [string]$GraphEnvFile, [string]$BaseCompose, [string]$LocalCompose, [string]$VerificationCompose) {
  return @(
    "-p", $ProjectName,
    "--env-file", $RootEnvFile,
    "--env-file", $GraphEnvFile,
    "-f", $BaseCompose,
    "-f", $LocalCompose,
    "-f", $VerificationCompose
  )
}

function Invoke-ManagedCompose([string[]]$ComposeArgs, [string[]]$CommandArgs, [string]$FailureCode) {
  & docker compose @ComposeArgs @CommandArgs
  if ($LASTEXITCODE -ne 0) { throw "$FailureCode`: docker compose command failed for the managed graph verification project." }
}

function Invoke-LiveCheck([string]$RepositoryRoot, [string]$Phase) {
  & node (Join-Path $RepositoryRoot "node_modules\tsx\dist\cli.mjs") (Join-Path $RepositoryRoot "deploy\graph\live-projection-check.ts") --phase $Phase
  if ($LASTEXITCODE -ne 0) { throw "NEBULA_LIVE_GATE_FAILED: $Phase phase failed; inspect the run-scoped diagnostic above." }
}

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$baseCompose = Join-Path $repositoryRoot "deploy\\compose.yaml"
$localCompose = Join-Path $repositoryRoot "deploy\\compose.graph-local.yaml"
$verificationCompose = Join-Path $repositoryRoot "deploy\\compose.graph-verify.yaml"
$gatewayDockerfile = Join-Path $repositoryRoot "deploy\\graph-gateway.Dockerfile"
$projectorDockerfile = Join-Path $repositoryRoot "deploy\\graph-projector.Dockerfile"
$gatewayDockerignore = Join-Path $repositoryRoot "deploy\\graph-gateway.Dockerfile.dockerignore"
$projectorDockerignore = Join-Path $repositoryRoot "deploy\\graph-projector.Dockerfile.dockerignore"
$gatewayHealthcheck = Join-Path $repositoryRoot "deploy\\graph\\gateway-healthcheck.go"
$buildScript = Join-Path $repositoryRoot "deploy\\graph\\build-images.ps1"
$bootstrapScript = Join-Path $repositoryRoot "deploy\\graph\\bootstrap-local.sh"
$bootstrapQuery = Join-Path $repositoryRoot "deploy\\graph\\bootstrap-local.ngql"

Assert-Condition (Test-Path -LiteralPath $baseCompose) "Base Compose file is missing."
Assert-Condition (Test-Path -LiteralPath $localCompose) "Local NebulaGraph Compose profile is missing."
Assert-Condition (Test-Path -LiteralPath $verificationCompose) "Live verification Compose overlay is missing."
Assert-Condition (Test-Path -LiteralPath $gatewayDockerfile) "Graph Gateway Dockerfile is missing."
Assert-Condition (Test-Path -LiteralPath $projectorDockerfile) "Graph Projector Dockerfile is missing."
Assert-Condition (Test-Path -LiteralPath $gatewayDockerignore) "Gateway Dockerfile-specific ignore file is missing."
Assert-Condition (Test-Path -LiteralPath $projectorDockerignore) "Projector Dockerfile-specific ignore file is missing."
Assert-Condition (Test-Path -LiteralPath $gatewayHealthcheck) "Gateway static healthcheck source is missing."
Assert-Condition (Test-Path -LiteralPath $buildScript) "Graph image build script is missing."
Assert-Condition (Test-Path -LiteralPath $bootstrapScript) "Local Nebula bootstrap script is missing."
Assert-Condition (Test-Path -LiteralPath $bootstrapQuery) "Local Nebula bootstrap query is missing."

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
DATABASE_URL=postgresql://specforge:configuration-check-only@deploy-postgres-1:5432/specforge_canonical?schema=public
POSTGRES_USER=specforge
POSTGRES_PASSWORD=configuration-check-only
POSTGRES_DB=specforge
SPECFORGE_WEB_PORT=3000
SPECFORGE_WEB_AUTH_MODE=static
SPECFORGE_WEB_PRINCIPAL_CLAIMS='{"actorType":"agent","actorId":"specforge-configuration-check","tenantId":"configuration-check","authSource":"static-bearer","grants":[{"scopeId":"com.huawei.celon.desiner","action":"read"}],"permissions":["knowledge:read"]}'
SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID=configuration-check
SPECFORGE_3A_CURSOR_KEYS='{"configuration-check":"c3BlY2ZvcmdlLWdyYXBoLWNvbmZpZ3VyYXRpb24tY2hlY2s="}'
SPECFORGE_NEBULA_USER=root
SPECFORGE_NEBULA_PASSWORD=configuration-check-only
SPECFORGE_NEBULA_SPACE=specforge_graph
SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID=enterprise-1
SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID=com.huawei.celon.desiner
SPECFORGE_GRAPH_HEALTH_SCOPE_PATH=pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner
'@ | Set-Content -LiteralPath $environmentFile -Encoding ascii

try {
  # Compose gives inherited process variables precedence over --env-file. Keep the
  # live canonical URL out of configuration assertions so they remain deterministic.
  $liveDatabaseUrl = $env:DATABASE_URL
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  try {
    $external = docker compose --env-file $environmentFile -f $baseCompose config --format json | ConvertFrom-Json
    $local = docker compose --env-file $environmentFile -f $localCompose config --format json | ConvertFrom-Json
    $verification = docker compose --env-file $environmentFile -f $localCompose -f $verificationCompose config --format json | ConvertFrom-Json
  } finally {
    if ($null -eq $liveDatabaseUrl) {
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    } else {
      $env:DATABASE_URL = $liveDatabaseUrl
    }
  }

  Assert-Condition (-not (Has-Service $external "nebula-metad")) "External-cluster mode must not include Nebula meta service."
  Assert-Condition (-not (Has-Service $external "nebula-graphd")) "External-cluster mode must not include Nebula graph service."
  Assert-Condition (-not (Has-Service $external "nebula-bootstrap")) "External-cluster mode must not include the local Nebula bootstrap job."
  Assert-Condition (-not (Has-Service $external "graph-gateway")) "External-cluster mode must not include the local graph Gateway."
  Assert-Condition (-not (Has-Service $external "graph-projector")) "External-cluster mode must not include the local Projector."

  foreach ($service in @("nebula-metad", "nebula-storaged", "nebula-graphd", "nebula-bootstrap", "graph-gateway", "graph-projector")) {
    Assert-Condition (Has-Service $local $service) "Local graph profile is missing $service."
  }
  Assert-Condition (-not (Has-Service $local "postgres")) "Local graph profile must not start PostgreSQL."
  foreach ($service in @("nebula-metad", "nebula-storaged", "nebula-graphd", "nebula-bootstrap", "graph-gateway", "graph-projector")) {
    $ports = (Get-Service $local $service).ports
    Assert-Condition ($null -eq $ports -or $ports.Count -eq 0) "$service must not publish a host port."
  }
  $gateway = Get-Service $local "graph-gateway"
  $projector = Get-Service $local "graph-projector"
  $bootstrap = Get-Service $local "nebula-bootstrap"
  Assert-Condition ($null -ne $gateway.build) "Gateway must be built from repository source."
  Assert-Condition ($gateway.build.dockerfile -eq "deploy/graph-gateway.Dockerfile") "Gateway must use its production Dockerfile."
  Assert-Condition ($gateway.pull_policy -eq "build") "Gateway must build the current repository source instead of reusing an old image."
  Assert-Condition ($null -ne $projector.build) "Projector must be built from repository source."
  Assert-Condition ($projector.build.dockerfile -eq "deploy/graph-projector.Dockerfile") "Projector must use its production Dockerfile."
  Assert-Condition ($projector.pull_policy -eq "build") "Projector must build the current repository source instead of reusing an old image."
  Assert-Condition ($null -ne $gateway.healthcheck) "Gateway healthcheck is required."
  Assert-Condition ($null -ne $projector.healthcheck) "Projector healthcheck is required."
  Assert-Condition ($bootstrap.depends_on."nebula-graphd".condition -eq "service_healthy") "Nebula bootstrap must wait for healthy graphd."
  Assert-Condition ($gateway.depends_on."nebula-bootstrap".condition -eq "service_completed_successfully") "Gateway must wait for local Nebula bootstrap completion."
  Assert-Condition ($null -eq $gateway.depends_on.postgres) "Gateway must not depend on a PostgreSQL service."
  Assert-Condition ($gateway.depends_on."nebula-graphd".condition -eq "service_healthy") "Gateway must wait for healthy Nebula graphd."
  Assert-Condition ($gateway.environment.DATABASE_URL -match "deploy-postgres-1:5432/specforge_canonical") "Gateway must use the canonical PostgreSQL connection for ACTIVE Manifest resolution."
  Assert-Condition ($gateway.networks.PSObject.Properties.Name -contains "deploy_default") "Gateway must join deploy_default for PostgreSQL ACTIVE Manifest resolution."
  Assert-Condition ($null -eq $projector.depends_on.postgres) "Projector must not depend on a PostgreSQL service."
  Assert-Condition ($projector.depends_on."nebula-graphd".condition -eq "service_healthy") "Projector must wait for healthy Nebula graphd."
  Assert-Condition ($projector.depends_on."graph-gateway".condition -eq "service_healthy") "Projector must wait for a healthy Gateway."
  Assert-Condition ($projector.environment.DATABASE_URL -match "deploy-postgres-1:5432/specforge_canonical") "Projector must use the canonical PostgreSQL connection."
  Assert-Condition ($local.networks.deploy_default.external -eq $true) "Local graph profile must join the external deploy_default network."

  $verificationGateway = Get-Service $verification "graph-gateway"
  $verificationProjector = Get-Service $verification "graph-projector"
  Assert-Condition ($verificationGateway.ports.host_ip -eq "127.0.0.1" -and $verificationGateway.ports.published -eq 18088 -and $verificationGateway.ports.target -eq 8088) "Live verification Gateway port must bind only to loopback."
  Assert-Condition ($verificationProjector.ports.host_ip -eq "127.0.0.1" -and $verificationProjector.ports.published -eq 18090 -and $verificationProjector.ports.target -eq 8090) "Live verification Projector port must bind only to loopback."

  Write-Host "NebulaGraph projection configuration assertions passed."
  if ($Live) {
    $rootEnvFile = Join-Path $repositoryRoot "deploy\.env"
    $graphEnvFile = Join-Path $repositoryRoot "deploy\graph\.env"
    if (-not (Test-Path -LiteralPath $rootEnvFile)) { throw "GRAPH_LIVE_DEPLOY_ENV_REQUIRED: copy deploy/.env.example to deploy/.env and configure the canonical PostgreSQL deployment." }
    if (-not (Test-Path -LiteralPath $graphEnvFile)) { throw "GRAPH_LIVE_GRAPH_ENV_REQUIRED: copy deploy/graph/.env.example to deploy/graph/.env and configure Nebula credentials." }

    $rootDotEnv = Join-Path $repositoryRoot ".env"
    $hostDatabaseUrl = $env:SPECFORGE_GRAPH_HEALTH_DATABASE_URL
    if ([string]::IsNullOrWhiteSpace($hostDatabaseUrl)) { $hostDatabaseUrl = $env:DATABASE_URL }
    if ([string]::IsNullOrWhiteSpace($hostDatabaseUrl)) { $hostDatabaseUrl = Get-DotEnvValue $rootDotEnv "DATABASE_URL" }
    Assert-CanonicalDatabaseUrl $hostDatabaseUrl "GRAPH_LIVE_DATABASE_NOT_CANONICAL"

    $containerDatabaseUrl = Get-DotEnvValue $graphEnvFile "DATABASE_URL"
    if ([string]::IsNullOrWhiteSpace($containerDatabaseUrl) -or $containerDatabaseUrl -notmatch "@deploy-postgres-1:5432/specforge_canonical(?:\?|$)") {
      throw "GRAPH_LIVE_CONTAINER_DATABASE_NOT_CANONICAL: deploy/graph/.env must use deploy-postgres-1:5432/specforge_canonical for the Projector container."
    }
    $verificationApplicationServiceId = Get-DotEnvValue $graphEnvFile "SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID"
    $verificationScopePath = Get-DotEnvValue $graphEnvFile "SPECFORGE_GRAPH_HEALTH_SCOPE_PATH"
    $verificationEnterpriseId = Get-DotEnvValue $graphEnvFile "SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID"
    if ([string]::IsNullOrWhiteSpace($verificationApplicationServiceId) -or [string]::IsNullOrWhiteSpace($verificationScopePath) -or [string]::IsNullOrWhiteSpace($verificationEnterpriseId)) {
      throw "GRAPH_LIVE_SCOPE_CONFIG_REQUIRED: deploy/graph/.env must define the exact verification Scope and enterprise id."
    }

    & docker version --format "{{.Server.Version}}" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GRAPH_LIVE_DOCKER_UNAVAILABLE: Docker Engine is not reachable." }
    & docker network inspect deploy_default | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GRAPH_LIVE_NETWORK_REQUIRED: external Docker network deploy_default is not available." }

    if ([string]::IsNullOrWhiteSpace($env:SPECFORGE_GRAPH_LIVE_RUN_ID)) { $env:SPECFORGE_GRAPH_LIVE_RUN_ID = [guid]::NewGuid().ToString("N") }
    $runId = $env:SPECFORGE_GRAPH_LIVE_RUN_ID
    $composeProjectName = Get-ManagedComposeProject $runId
    $composeArgs = Get-ManagedComposeArgs $composeProjectName $rootEnvFile $graphEnvFile $baseCompose $localCompose $verificationCompose
    $managedStarted = $false
    $primaryError = $null
    $cleanupErrors = @()
    $previousDatabaseUrl = $env:DATABASE_URL
    $previousHostDatabaseUrl = $env:SPECFORGE_GRAPH_HEALTH_DATABASE_URL
    $previousGatewayUrl = $env:SPECFORGE_GRAPH_GATEWAY_URL
    $previousProjectorUrl = $env:SPECFORGE_PROJECTOR_HEALTH_URL
    $previousHealthApplicationServiceId = $env:SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID
    $previousHealthScopePath = $env:SPECFORGE_GRAPH_HEALTH_SCOPE_PATH
    $previousHealthEnterpriseId = $env:SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID
    $previousGatewayPort = $env:SPECFORGE_GRAPH_GATEWAY_HOST_PORT
    $previousProjectorPort = $env:SPECFORGE_GRAPH_PROJECTOR_HOST_PORT
    try {
      $env:DATABASE_URL = $containerDatabaseUrl
      $env:SPECFORGE_GRAPH_HEALTH_DATABASE_URL = $hostDatabaseUrl
      $env:SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID = $verificationApplicationServiceId
      $env:SPECFORGE_GRAPH_HEALTH_SCOPE_PATH = $verificationScopePath
      $env:SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID = $verificationEnterpriseId
      $env:SPECFORGE_GRAPH_GATEWAY_HOST_PORT = "0"
      $env:SPECFORGE_GRAPH_PROJECTOR_HOST_PORT = "0"
      $managedStarted = $true
      Invoke-ManagedCompose $composeArgs (@("up", "-d", "--build") + $managedGraphServices) "GRAPH_LIVE_COMPOSE_START_FAILED"

      $gatewayBinding = (& docker compose @composeArgs port graph-gateway 8088 | Select-Object -Last 1).Trim()
      $projectorBinding = (& docker compose @composeArgs port graph-projector 8090 | Select-Object -Last 1).Trim()
      if ($gatewayBinding -notmatch ":(?<port>\d+)$" -or $projectorBinding -notmatch ":(?<port>\d+)$") { throw "GRAPH_LIVE_PORT_DISCOVERY_FAILED: managed graph services did not publish loopback ports." }
      $env:SPECFORGE_GRAPH_GATEWAY_URL = "http://127.0.0.1:$($gatewayBinding -replace '^.*:', '')"
      $env:SPECFORGE_PROJECTOR_HEALTH_URL = "http://127.0.0.1:$($projectorBinding -replace '^.*:', '')"
      Invoke-LiveCheck $repositoryRoot "prepare"
      Invoke-ManagedCompose $composeArgs @("up", "-d", "--force-recreate", "--no-deps", "graph-projector") "PROJECTOR_RESTART_BLOCKED"
      $projectorBinding = (& docker compose @composeArgs port graph-projector 8090 | Select-Object -Last 1).Trim()
      if ($projectorBinding -notmatch ":(?<port>\d+)$") { throw "GRAPH_LIVE_PORT_DISCOVERY_FAILED: recreated Projector did not publish a loopback port." }
      $env:SPECFORGE_PROJECTOR_HEALTH_URL = "http://127.0.0.1:$($projectorBinding -replace '^.*:', '')"
      Invoke-LiveCheck $repositoryRoot "verify"
      Write-Host "NebulaGraph live outbox, checkpoint, traversal, restart, and idempotency assertions passed."
    } catch {
      $primaryError = $_
    } finally {
      if ($managedStarted) {
        try { Invoke-LiveCheck $repositoryRoot "cleanup" } catch { $cleanupErrors += $_ }
        try { Invoke-ManagedCompose $composeArgs ((@("stop") + $managedGraphServices)) "GRAPH_LIVE_COMPOSE_STOP_FAILED" } catch { $cleanupErrors += $_ }
        try { Invoke-ManagedCompose $composeArgs ((@("rm", "--force", "--stop") + $managedGraphServices)) "GRAPH_LIVE_COMPOSE_REMOVE_FAILED" } catch { $cleanupErrors += $_ }
        try { Invoke-ManagedCompose $composeArgs @("down", "--volumes", "--remove-orphans") "GRAPH_LIVE_COMPOSE_DOWN_FAILED" } catch { $cleanupErrors += $_ }
      }
      if ($null -ne $previousDatabaseUrl) { $env:DATABASE_URL = $previousDatabaseUrl } else { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
      if ($null -ne $previousHostDatabaseUrl) { $env:SPECFORGE_GRAPH_HEALTH_DATABASE_URL = $previousHostDatabaseUrl } else { Remove-Item Env:SPECFORGE_GRAPH_HEALTH_DATABASE_URL -ErrorAction SilentlyContinue }
      if ($null -ne $previousGatewayUrl) { $env:SPECFORGE_GRAPH_GATEWAY_URL = $previousGatewayUrl } else { Remove-Item Env:SPECFORGE_GRAPH_GATEWAY_URL -ErrorAction SilentlyContinue }
      if ($null -ne $previousProjectorUrl) { $env:SPECFORGE_PROJECTOR_HEALTH_URL = $previousProjectorUrl } else { Remove-Item Env:SPECFORGE_PROJECTOR_HEALTH_URL -ErrorAction SilentlyContinue }
      if ($null -ne $previousHealthApplicationServiceId) { $env:SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID = $previousHealthApplicationServiceId } else { Remove-Item Env:SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID -ErrorAction SilentlyContinue }
      if ($null -ne $previousHealthScopePath) { $env:SPECFORGE_GRAPH_HEALTH_SCOPE_PATH = $previousHealthScopePath } else { Remove-Item Env:SPECFORGE_GRAPH_HEALTH_SCOPE_PATH -ErrorAction SilentlyContinue }
      if ($null -ne $previousHealthEnterpriseId) { $env:SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID = $previousHealthEnterpriseId } else { Remove-Item Env:SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID -ErrorAction SilentlyContinue }
      if ($null -ne $previousGatewayPort) { $env:SPECFORGE_GRAPH_GATEWAY_HOST_PORT = $previousGatewayPort } else { Remove-Item Env:SPECFORGE_GRAPH_GATEWAY_HOST_PORT -ErrorAction SilentlyContinue }
      if ($null -ne $previousProjectorPort) { $env:SPECFORGE_GRAPH_PROJECTOR_HOST_PORT = $previousProjectorPort } else { Remove-Item Env:SPECFORGE_GRAPH_PROJECTOR_HOST_PORT -ErrorAction SilentlyContinue }
    }
    if ($null -ne $primaryError) { throw $primaryError }
    if ($cleanupErrors.Count -gt 0) { throw "GRAPH_LIVE_CLEANUP_FAILED: run $runId completed with cleanup errors; inspect the preceding diagnostics." }
  }
} finally {
  Remove-Item -LiteralPath $environmentFile -Force -ErrorAction SilentlyContinue
}
