[CmdletBinding()]
param(
  [int]$Port = 3001,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtimeDirectory = Join-Path $repositoryRoot ".specforge\runtime"
$keyPath = Join-Path $HOME ".specforge\attestation-key.json"
$rootEnvPath = Join-Path $repositoryRoot ".env"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "pnpm is required to run the local MCP server."
}
if ([string]::IsNullOrWhiteSpace($env:SPECFORGE_MCP_BEARER_TOKEN)) {
  throw "Set SPECFORGE_MCP_BEARER_TOKEN in the current process before starting the server."
}
if ([string]::IsNullOrWhiteSpace($env:SPECFORGE_MCP_TOKEN_SCOPE_IDS)) {
  throw "Set SPECFORGE_MCP_TOKEN_SCOPE_IDS to the exact authorized application-service ID."
}
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL) -and (Test-Path $rootEnvPath)) {
  $databaseLine = Get-Content $rootEnvPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if ($databaseLine -match '^\s*DATABASE_URL\s*=\s*(.*)\s*$') {
    $databaseUrl = $matches[1].Trim()
    if (($databaseUrl.StartsWith('"') -and $databaseUrl.EndsWith('"')) -or ($databaseUrl.StartsWith("'") -and $databaseUrl.EndsWith("'"))) {
      $databaseUrl = $databaseUrl.Substring(1, $databaseUrl.Length - 2)
    }
    $env:DATABASE_URL = $databaseUrl
  }
}
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw "Set DATABASE_URL to the authoritative PostgreSQL database before starting the MCP server."
}

if ([string]::IsNullOrWhiteSpace($env:SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8)) {
  if (-not (Test-Path $keyPath)) {
    throw "No attestation key found. Run new-attestation-key.ps1 first, or set SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8."
  }
  $key = Get-Content $keyPath -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($key.privateKeyPkcs8)) {
    throw "The user-local attestation key does not contain privateKeyPkcs8."
  }
  $env:SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8 = $key.privateKeyPkcs8
  if ([string]::IsNullOrWhiteSpace($env:SPECFORGE_ATTESTATION_KEY_ID)) {
    $env:SPECFORGE_ATTESTATION_KEY_ID = $key.keyId
  }
}

$env:SPECFORGE_MCP_TRANSPORT = "http"
$env:SPECFORGE_MCP_HTTP_PORT = [string]$Port
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$stdoutPath = Join-Path $runtimeDirectory "mcp-http.out.log"
$stderrPath = Join-Path $runtimeDirectory "mcp-http.err.log"
$pnpm = (Get-Command pnpm).Source
$arguments = @("--filter", "@specforge/mcp-server", "dev")

if ($Foreground) {
  & $pnpm @arguments
  exit $LASTEXITCODE
}

$process = Start-Process -FilePath $pnpm -ArgumentList $arguments -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
Write-Output "SpecForge MCP HTTP started: pid=$($process.Id) endpoint=http://127.0.0.1:$Port/mcp"
Write-Output "Logs: $stdoutPath and $stderrPath"
