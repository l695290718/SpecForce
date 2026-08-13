[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$script:RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:DeployDirectory = Join-Path $script:RepositoryRoot "deploy"
$script:EnvironmentFile = Join-Path $script:DeployDirectory ".env"
$script:EnvironmentExample = Join-Path $script:DeployDirectory ".env.example"
$script:ComposeFile = Join-Path $script:DeployDirectory "compose.yaml"
$script:ExternalComposeFile = Join-Path $script:DeployDirectory "compose.external-postgres.yaml"

function Assert-DockerReady {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI is not installed or not available on PATH."
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Engine is not running. Start Docker Desktop or the Docker daemon, then retry."
  }
}

function Ensure-EnvironmentFile {
  if (-not (Test-Path $script:EnvironmentFile)) {
    Copy-Item $script:EnvironmentExample $script:EnvironmentFile
    throw "Created deploy/.env from deploy/.env.example. Set POSTGRES_PASSWORD and SPECFORGE_3A_CURSOR_KEYS, then retry."
  }
}

function Read-EnvironmentFile {
  $values = @{}
  foreach ($line in Get-Content $script:EnvironmentFile) {
    if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
      $value = $matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $values[$matches[1]] = $value
    }
  }
  return $values
}

function Assert-DeploymentEnvironment {
  param([hashtable]$Values)

  foreach ($name in @("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "SPECFORGE_3A_CURSOR_KEYS", "SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID")) {
    if (-not $Values[$name]) { throw "$name is required in deploy/.env." }
  }
  if ($Values.POSTGRES_PASSWORD -eq "replace-with-a-long-random-password") {
    throw "POSTGRES_PASSWORD still contains the placeholder value in deploy/.env."
  }
  $webAuthMode = if ($Values.SPECFORGE_WEB_AUTH_MODE) { $Values.SPECFORGE_WEB_AUTH_MODE.ToLowerInvariant() } else { "static" }
  if ($webAuthMode -eq "static" -and -not $Values.SPECFORGE_WEB_PRINCIPAL_CLAIMS) {
    throw "SPECFORGE_WEB_PRINCIPAL_CLAIMS is required when SPECFORGE_WEB_AUTH_MODE=static."
  }
  if ($webAuthMode -notin @("static", "production")) {
    throw "SPECFORGE_WEB_AUTH_MODE must be static or production."
  }
  $webPort = if ($Values.SPECFORGE_WEB_PORT) { [int]$Values.SPECFORGE_WEB_PORT } else { 3010 }
  if ($webPort -lt 1 -or $webPort -gt 65535) { throw "SPECFORGE_WEB_PORT must be between 1 and 65535." }
  try {
    $keys = $Values.SPECFORGE_3A_CURSOR_KEYS | ConvertFrom-Json
  } catch {
    throw "SPECFORGE_3A_CURSOR_KEYS must be a JSON object of key IDs to base64 secrets."
  }
  $activeKey = $Values.SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID
  if ($null -eq $keys.PSObject.Properties[$activeKey] -or -not $keys.$activeKey) {
    throw "SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID must reference a non-empty key in SPECFORGE_3A_CURSOR_KEYS."
  }
  return $webPort
}

function Get-ComposeArguments {
  param([switch]$ExternalPostgres)
  $arguments = @("compose", "--env-file", $script:EnvironmentFile, "-f", $script:ComposeFile)
  if ($ExternalPostgres) { $arguments += @("-f", $script:ExternalComposeFile) }
  return $arguments
}

function Invoke-SpecForgeCompose {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [switch]$ExternalPostgres
  )
  $compose = @(Get-ComposeArguments -ExternalPostgres:$ExternalPostgres) + $Arguments
  & docker @compose
  if ($LASTEXITCODE -ne 0) { throw "docker compose $($Arguments -join ' ') failed." }
}

function Wait-ForWebHealth {
  param([Parameter(Mandatory)][int]$Port)
  for ($attempt = 1; $attempt -le 45; $attempt++) {
    try {
      $response = Invoke-WebRequest "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -eq 200) { return }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  throw "Web health check failed on port $Port. Inspect docker compose logs web."
}

function Wait-ForOneShotService {
  param(
    [Parameter(Mandatory)][string]$Service,
    [switch]$ExternalPostgres
  )
  for ($attempt = 1; $attempt -le 45; $attempt++) {
    $compose = @(Get-ComposeArguments -ExternalPostgres:$ExternalPostgres) + @("ps", "-a", "--format", "json", $Service)
    $raw = & docker @compose 2>$null
    if ($LASTEXITCODE -eq 0 -and $raw) {
      try {
        $state = ($raw | ConvertFrom-Json | Select-Object -First 1)
        if ($state.State -match "Exited" -and [int]$state.ExitCode -eq 0) { return }
        if ($state.State -match "Exited" -and [int]$state.ExitCode -ne 0) {
          $logs = @(Get-ComposeArguments -ExternalPostgres:$ExternalPostgres) + @("logs", "--no-color", $Service)
          & docker @logs
          throw "$Service failed with exit code $($state.ExitCode)."
        }
      } catch {
        if ($_.Exception.Message -like "Bootstrap failed*") { throw }
      }
    }
    Start-Sleep -Seconds 2
  }
  throw "$Service did not complete in time. Inspect docker compose logs $Service."
}

function Wait-ForBootstrap {
  param([switch]$ExternalPostgres)
  Wait-ForOneShotService -Service "bootstrap" -ExternalPostgres:$ExternalPostgres
  Wait-ForOneShotService -Service "three-a-bootstrap" -ExternalPostgres:$ExternalPostgres
}
