[CmdletBinding()]
param(
  [string]$KeyId = "local-env-ed25519-1",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required to generate an Ed25519 attestation key."
}

$keyDirectory = Join-Path $HOME ".specforge"
$keyPath = Join-Path $keyDirectory "attestation-key.json"
New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
if ((Test-Path $keyPath) -and -not $Force) {
  throw "Attestation key already exists at $keyPath. Use -Force only for an intentional key rotation."
}

$nodeScript = @'
const { generateKeyPairSync } = require("node:crypto");
const keyId = process.argv[1];
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
process.stdout.write(JSON.stringify({
  keyId,
  algorithm: "Ed25519",
  privateKeyPkcs8: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  publicKeySpki: publicKey.export({ format: "der", type: "spki" }).toString("base64")
}, null, 2));
'@

$json = (& node -e $nodeScript -- $KeyId)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($json -join ""))) {
  throw "Ed25519 attestation key generation failed."
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($keyPath, ($json -join "") + [Environment]::NewLine, $utf8NoBom)

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "FullControl", "Allow")
$acl.AddAccessRule($rule)
Set-Acl -Path $keyPath -AclObject $acl

Write-Output "Created user-local Ed25519 attestation key: $keyPath"
Write-Output "Key ID: $KeyId"
Write-Output "The private key is outside the repository and is not written to .specforge.yaml."
