[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [string]$SigningKeyId = $env:SCANNER_RELEASE_SIGNING_KEY_ID,
  [string]$MinimumScannerVersion = $Version,
  [string]$ArtifactBaseUri = $env:SCANNER_RELEASE_ARTIFACT_BASE_URI,
  [string]$PrivateKeyPath = $env:SCANNER_RELEASE_PRIVATE_KEY_PATH,
  [string]$PrivateKeyEnvVar = 'SCANNER_RELEASE_PRIVATE_KEY',
  [datetime]$ExpiresAt = [datetime]::UtcNow.AddDays(180),
  [string]$OutputRoot = 'dist/scanner',
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-CanonicalPath([string]$Path, [string]$BasePath) {
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Write-Utf8NoBom([string]$Path, [string]$Value) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

function Test-IsWithin([string]$Parent, [string]$Candidate) {
  $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $candidatePath = [System.IO.Path]::GetFullPath($Candidate)
  $isWindowsHost = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
  $comparison = if ($isWindowsHost) { [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }
  return $candidatePath.StartsWith($parentPath + [System.IO.Path]::DirectorySeparatorChar, $comparison) -or $candidatePath.Equals($parentPath, $comparison)
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "RELEASE_TOOL_REQUIRED: $Name"
  }
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cliRoot = Join-Path $repositoryRoot 'apps/specforge-cli'
$outputBase = Get-CanonicalPath $OutputRoot $repositoryRoot

Require-Command 'go'
Require-Command 'node'

$hostOS = (& go env GOHOSTOS).Trim()
$hostArch = (& go env GOHOSTARCH).Trim()
$targetOS = (& go env GOOS).Trim()
$targetArch = (& go env GOARCH).Trim()
if ($LASTEXITCODE -ne 0 -or -not $hostOS -or -not $hostArch) {
  throw 'GO_ENV_UNAVAILABLE'
}
if ($targetOS -ne $hostOS -or $targetArch -ne $hostArch) {
  throw "SCANNER_CROSS_COMPILE_FORBIDDEN: host=$hostOS-$hostArch target=$targetOS-$targetArch"
}

if (-not $SigningKeyId) { throw 'SCANNER_RELEASE_SIGNING_KEY_ID_REQUIRED' }
if (-not $ArtifactBaseUri) { throw 'SCANNER_RELEASE_ARTIFACT_BASE_URI_REQUIRED' }
$artifactBase = $null
if (-not [uri]::TryCreate($ArtifactBaseUri, [System.UriKind]::Absolute, [ref]$artifactBase) -or $artifactBase.Scheme -notin @('https', 'http')) {
  throw 'SCANNER_RELEASE_ARTIFACT_BASE_URI_INVALID'
}
if ($ExpiresAt.ToUniversalTime() -le [datetime]::UtcNow) { throw 'SCANNER_RELEASE_EXPIRY_INVALID' }

$privateKey = [Environment]::GetEnvironmentVariable($PrivateKeyEnvVar)
if ($PrivateKeyPath) {
  $resolvedKeyPath = Get-CanonicalPath $PrivateKeyPath (Get-Location).Path
  if (Test-IsWithin $repositoryRoot $resolvedKeyPath) {
    throw 'SCANNER_RELEASE_PRIVATE_KEY_IN_REPOSITORY_FORBIDDEN'
  }
  if (-not (Test-Path -LiteralPath $resolvedKeyPath -PathType Leaf)) {
    throw 'SCANNER_RELEASE_PRIVATE_KEY_FILE_NOT_FOUND'
  }
  if ($privateKey) {
    throw 'SCANNER_RELEASE_PRIVATE_KEY_SOURCE_AMBIGUOUS'
  }
  $privateKey = Get-Content -LiteralPath $resolvedKeyPath -Raw -Encoding utf8
}
if (-not $privateKey) {
  throw "SCANNER_RELEASE_PRIVATE_KEY_REQUIRED: set $PrivateKeyEnvVar or -PrivateKeyPath outside the repository"
}

$platform = "$targetOS-$targetArch"
$artifactName = if ($targetOS -eq 'windows') { 'specforge.exe' } else { 'specforge' }
$releaseDirectory = Join-Path (Join-Path $outputBase $Version) $platform
$artifactPath = Join-Path $releaseDirectory $artifactName

if ($ValidateOnly) {
  Write-Host "Release inputs valid for $platform; no artifact was built."
  return
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
Push-Location $cliRoot
try {
  & go build -trimpath -o $artifactPath .
  if ($LASTEXITCODE -ne 0) { throw 'SCANNER_BUILD_FAILED' }
} finally {
  Pop-Location
}

$artifact = Get-Item -LiteralPath $artifactPath
$artifactDigest = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
$issuedAt = [datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$expiresAtValue = $ExpiresAt.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$artifactUri = $artifactBase.AbsoluteUri.TrimEnd('/') + "/$Version/$platform/$artifactName"

$extractors = @(
  @{ id = 'repository-build-metadata'; version = '1.0.0' },
  @{ id = 'openapi-asyncapi-contracts'; version = '1.0.0' },
  @{ id = 'prisma-sql-schema'; version = '1.0.0' },
  @{ id = 'go-ast'; version = '1.0.0' },
  @{ id = 'java-spring-conservative'; version = '1.0.0' },
  @{ id = 'typescript-node-conservative'; version = '1.0.0' },
  @{ id = 'test-evidence'; version = '1.0.0' },
  @{ id = 'configuration-structured'; version = '1.0.0' },
  @{ id = 'deployment-metadata'; version = '1.0.0' },
  @{ id = 'documentation-sections'; version = '1.0.0' }
)

$unsignedManifest = [ordered]@{
  contractVersion = '2.0'
  releaseId = "scanner-release:$Version-$platform"
  scannerVersion = $Version
  platform = $platform
  artifact = [ordered]@{
    uri = $artifactUri
    sha256 = $artifactDigest
    sizeBytes = [int64]$artifact.Length
  }
  schemaVersions = @('2.0')
  extractors = $extractors
  signingKeyId = $SigningKeyId
  algorithm = 'Ed25519'
  issuedAt = $issuedAt
  expiresAt = $expiresAtValue
  status = 'ACTIVE'
}

$unsignedPath = Join-Path $releaseDirectory 'manifest.unsigned.json'
$manifestPath = Join-Path $releaseDirectory 'manifest.json'
$canonicalPath = Join-Path $releaseDirectory 'manifest.canonical.json'
Write-Utf8NoBom $unsignedPath (($unsignedManifest | ConvertTo-Json -Depth 10) + "`n")

$signer = @'
const crypto = require("node:crypto");
const fs = require("node:fs");
const [unsignedPath, manifestPath, canonicalPath] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(unsignedPath, "utf8"));
function canonical(input) {
  if (input === null || typeof input === "boolean" || typeof input === "string") return JSON.stringify(input);
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("CANONICAL_JSON_NON_FINITE_NUMBER");
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) return `[${input.map(canonical).join(",")}]`;
  if (typeof input !== "object") throw new Error("CANONICAL_JSON_VALUE_INVALID");
  return `{${Object.keys(input).sort().map((key) => `${canonical(key)}:${canonical(input[key])}`).join(",")}}`;
}
const supplied = process.env.SPECFORGE_RELEASE_SIGNING_KEY_MATERIAL;
if (!supplied) throw new Error("SCANNER_RELEASE_PRIVATE_KEY_REQUIRED");
let key;
if (supplied.includes("BEGIN PRIVATE KEY")) {
  key = crypto.createPrivateKey(supplied);
} else {
  const decoded = Buffer.from(supplied.replace(/\s/g, ""), "base64");
  const decodedText = decoded.toString("utf8");
  key = decodedText.includes("BEGIN PRIVATE KEY")
    ? crypto.createPrivateKey(decodedText)
    : crypto.createPrivateKey({ key: decoded, format: "der", type: "pkcs8" });
}
if (key.asymmetricKeyType !== "ed25519") throw new Error("SCANNER_RELEASE_KEY_NOT_ED25519");
const bytes = Buffer.from(canonical(value), "utf8");
const signatureBytes = crypto.sign(null, bytes, key);
if (!crypto.verify(null, bytes, crypto.createPublicKey(key), signatureBytes)) {
  throw new Error("SCANNER_RELEASE_SIGNATURE_SELF_VERIFY_FAILED");
}
const signature = signatureBytes.toString("base64");
fs.writeFileSync(canonicalPath, bytes);
fs.writeFileSync(manifestPath, JSON.stringify({ ...value, signature }, null, 2) + "\n");
'@

$previousSigningMaterial = $env:SPECFORGE_RELEASE_SIGNING_KEY_MATERIAL
try {
  $env:SPECFORGE_RELEASE_SIGNING_KEY_MATERIAL = $privateKey
  $signer | & node - $unsignedPath $manifestPath $canonicalPath
  if ($LASTEXITCODE -ne 0) { throw 'SCANNER_RELEASE_SIGNING_FAILED' }
} finally {
  if ($null -eq $previousSigningMaterial) {
    Remove-Item Env:SPECFORGE_RELEASE_SIGNING_KEY_MATERIAL -ErrorAction SilentlyContinue
  } else {
    $env:SPECFORGE_RELEASE_SIGNING_KEY_MATERIAL = $previousSigningMaterial
  }
  Remove-Item -LiteralPath $unsignedPath -Force -ErrorAction SilentlyContinue
}

@{
  contractVersion = '2.0'
  scannerVersion = $Version
  minimumScannerVersion = $MinimumScannerVersion
  signingKeyId = $SigningKeyId
  platform = $platform
  manifest = 'manifest.json'
  canonicalUnsignedManifest = 'manifest.canonical.json'
} | ConvertTo-Json -Depth 5 | ForEach-Object { Write-Utf8NoBom (Join-Path $releaseDirectory 'release-metadata.json') ($_ + "`n") }

"$artifactDigest  $artifactName" | Set-Content -LiteralPath (Join-Path $releaseDirectory 'SHA256SUMS') -Encoding ascii
Write-Host "Built and signed $platform scanner release at $releaseDirectory"
