param(
  [string]$GatewayUrl = "http://127.0.0.1:8088",
  [Parameter(Mandatory = $true)][string]$EnterpriseId,
  [Parameter(Mandatory = $true)][string]$ApplicationServiceId,
  [Parameter(Mandatory = $true)][string]$ScopePath,
  [Parameter(Mandatory = $true)][string]$AssetType,
  [Parameter(Mandatory = $true)][string]$AssetId,
  [int]$MaxAssertions = 100,
  [int]$MaxTargets = 100,
  [int]$MaxTraceSteps = 100,
  [int]$TimeoutMS = 2000,
  [int]$MaxPayloadBytes = 512000
)

$ErrorActionPreference = "Stop"

function Fail([string]$Code, [string]$Message) { throw "$Code`: $Message" }
function Require([bool]$Condition, [string]$Code, [string]$Message) { if (-not $Condition) { Fail $Code $Message } }

Require (-not [string]::IsNullOrWhiteSpace($GatewayUrl)) "SEMANTIC_VERIFY_GATEWAY_REQUIRED" "Gateway URL is required."
Require (-not [string]::IsNullOrWhiteSpace($EnterpriseId) -and -not [string]::IsNullOrWhiteSpace($ApplicationServiceId) -and -not [string]::IsNullOrWhiteSpace($ScopePath)) "SEMANTIC_VERIFY_SCOPE_REQUIRED" "Exact Scope is required."
Require (-not [string]::IsNullOrWhiteSpace($AssetType) -and -not [string]::IsNullOrWhiteSpace($AssetId)) "SEMANTIC_VERIFY_ASSET_REQUIRED" "Asset identity is required."
foreach ($budget in @($MaxAssertions, $MaxTargets, $MaxTraceSteps, $TimeoutMS, $MaxPayloadBytes)) { Require ($budget -gt 0) "SEMANTIC_VERIFY_BUDGET_INVALID" "All query budgets must be positive." }

$base = $GatewayUrl.TrimEnd('/')
try {
  $health = Invoke-RestMethod -Method Get -Uri "$base/health" -TimeoutSec ([Math]::Ceiling($TimeoutMS / 1000) + 2)
} catch {
  Fail "SEMANTIC_VERIFY_GATEWAY_UNAVAILABLE" "Cannot reach $base/health."
}
Require ($health.graphSchemaReady -eq $true) "SEMANTIC_VERIFY_SCHEMA_NOT_READY" "Gateway graph schema is not ready."

$body = @{
  scope = @{ enterpriseId = $EnterpriseId; applicationServiceId = $ApplicationServiceId; scopePath = $ScopePath }
  assetType = $AssetType
  assetId = $AssetId
  budget = @{ maxAssertions = $MaxAssertions; maxTargets = $MaxTargets; maxTraceSteps = $MaxTraceSteps; timeoutMs = $TimeoutMS; maxPayloadBytes = $MaxPayloadBytes }
} | ConvertTo-Json -Depth 8

try {
  $result = Invoke-RestMethod -Method Post -Uri "$base/v1/architecture-queries" -ContentType "application/json" -Body $body -TimeoutSec ([Math]::Ceiling($TimeoutMS / 1000) + 2)
} catch {
  Fail "SEMANTIC_VERIFY_QUERY_FAILED" "The exact-Scope semantic query failed."
}

Require ($result.source -in @("NEBULA", "POSTGRESQL_FALLBACK")) "SEMANTIC_VERIFY_SOURCE_INVALID" "Unexpected semantic query source."
Require ($result.projection -ne $null) "SEMANTIC_VERIFY_IDENTITY_MISSING" "The query response did not carry its active projection identity."
Require ($result.targets.BIZ -ne $null -and $result.targets.SYS -ne $null -and $result.targets.TECH -ne $null) "SEMANTIC_VERIFY_LAYER_BUCKETS_MISSING" "BIZ/SYS/TECH result buckets are required."
Write-Host ("Semantic projection query passed: source={0}, status={1}, manifest={2}, generation={3}" -f $result.source, $result.status, $result.projection.manifestId, $result.projection.generationId)
