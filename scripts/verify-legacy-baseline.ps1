[CmdletBinding()]
param(
  [string]$ReportPath = 'artifacts/legacy-baseline-verification.json',
  [switch]$SkipDatabaseIntegration,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$report = [System.Collections.Generic.List[object]]::new()
$startedAt = [datetime]::UtcNow
$stageFailure = $null
$isWindowsHost = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
$vitestRelativePath = if ($isWindowsHost) { 'node_modules/.bin/vitest.cmd' } else { 'node_modules/.bin/vitest' }
$vitestCommand = Join-Path $repositoryRoot $vitestRelativePath

function Invoke-StageStep([string]$Name, [string]$WorkingDirectory, [string]$Command, [string[]]$Arguments) {
  Write-Host "==> $Name"
  $stepStarted = [datetime]::UtcNow
  $exitCode = 1
  $commandError = $null
  Push-Location $WorkingDirectory
  try {
    & $Command @Arguments
    $exitCode = $LASTEXITCODE
  } catch {
    $commandError = $_
    $exitCode = 1
  } finally {
    Pop-Location
  }
  $result = [ordered]@{
    name = $Name
    command = (@($Command) + $Arguments) -join ' '
    status = if ($exitCode -eq 0) { 'PASSED' } else { 'FAILED' }
    exitCode = $exitCode
    durationSeconds = [math]::Round(([datetime]::UtcNow - $stepStarted).TotalSeconds, 3)
  }
  $report.Add($result)
  if ($exitCode -ne 0) {
    if ($commandError) { throw "LEGACY_BASELINE_STAGE_FAILED: $Name ($($commandError.Exception.Message))" }
    throw "LEGACY_BASELINE_STAGE_FAILED: $Name"
  }
}

function Add-SkippedStep([string]$Name, [string]$Reason) {
  Write-Host "==> $Name (SKIPPED: $Reason)"
  $report.Add([ordered]@{
    name = $Name
    command = $null
    status = 'SKIPPED'
    exitCode = $null
    durationSeconds = 0
    reason = $Reason
  })
}

function Invoke-OptionalVitestGroup([string]$Name, [string[]]$RelativePaths) {
  $existingPaths = @($RelativePaths | Where-Object { Test-Path -LiteralPath (Join-Path $repositoryRoot "apps/mcp-server/$_") })
  if ($existingPaths.Count -ne $RelativePaths.Count) {
    $missing = @($RelativePaths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $repositoryRoot "apps/mcp-server/$_")) })
    Add-SkippedStep $Name ("TEST_FILE_NOT_PRESENT: " + ($missing -join ','))
    return
  }
  Invoke-StageStep $Name $repositoryRoot $vitestCommand (@('run', '--root', 'apps/mcp-server') + $existingPaths)
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'PNPM_REQUIRED' }
if (-not (Get-Command go -ErrorAction SilentlyContinue)) { throw 'GO_REQUIRED' }

$oldGoCache = $env:GOCACHE
$goCache = Join-Path $repositoryRoot '.specforge/cache/go-build'
New-Item -ItemType Directory -Path $goCache -Force | Out-Null
$env:GOCACHE = $goCache

try {
  Invoke-StageStep 'scan-contract-drift' $repositoryRoot 'pnpm' @('scanner-contract:check')
  Invoke-StageStep 'go-scanner-tests' (Join-Path $repositoryRoot 'apps/specforge-cli') 'go' @('test', './...')
  $scannerArtifact = if ($isWindowsHost) { 'dist/specforge.exe' } else { 'dist/specforge' }
  Invoke-StageStep 'go-scanner-build' (Join-Path $repositoryRoot 'apps/specforge-cli') 'go' @('build', '-trimpath', '-o', $scannerArtifact, '.')
  Invoke-StageStep 'core-focused-tests' $repositoryRoot 'pnpm' @('--filter', '@specforge/core', 'test')
  Invoke-StageStep 'mcp-scanner-and-knowledge-tests' $repositoryRoot $vitestCommand @('run', '--root', 'apps/mcp-server', 'src/scanner', 'src/knowledge')

  if (-not $SkipDatabaseIntegration) {
    if (-not $env:DATABASE_URL) { throw 'DATABASE_URL_REQUIRED_OR_USE_SKIPDATABASEINTEGRATION' }
    $oldIntegration = $env:SPECFORGE_KNOWLEDGE_INTEGRATION
    $oldScale = $env:SPECFORGE_KNOWLEDGE_SCALE
    try {
      $env:SPECFORGE_KNOWLEDGE_INTEGRATION = '1'
      Invoke-OptionalVitestGroup 'postgresql-integration' @('src/scanner/batch-persistence.integration.test.ts', 'src/knowledge/persistence.integration.test.ts', 'src/knowledge/promotion.integration.test.ts')
      Invoke-OptionalVitestGroup 'legacy-baseline-e2e' @('src/scanner/legacy-baseline.e2e.test.ts')
      $env:SPECFORGE_KNOWLEDGE_SCALE = '1'
      Invoke-OptionalVitestGroup 'legacy-baseline-scale' @('src/scanner/legacy-baseline.scale.test.ts')
    } finally {
      if ($null -eq $oldIntegration) { Remove-Item Env:SPECFORGE_KNOWLEDGE_INTEGRATION -ErrorAction SilentlyContinue } else { $env:SPECFORGE_KNOWLEDGE_INTEGRATION = $oldIntegration }
      if ($null -eq $oldScale) { Remove-Item Env:SPECFORGE_KNOWLEDGE_SCALE -ErrorAction SilentlyContinue } else { $env:SPECFORGE_KNOWLEDGE_SCALE = $oldScale }
    }
  }

  Invoke-StageStep 'workspace-typecheck' $repositoryRoot 'pnpm' @('typecheck')
  if (-not $SkipBuild) {
    $oldStandalone = $env:SPECFORGE_NEXT_STANDALONE
    try {
      if ($isWindowsHost) { $env:SPECFORGE_NEXT_STANDALONE = '0' }
      Invoke-StageStep 'production-build' $repositoryRoot 'pnpm' @('build')
    } finally {
      if ($null -eq $oldStandalone) { Remove-Item Env:SPECFORGE_NEXT_STANDALONE -ErrorAction SilentlyContinue } else { $env:SPECFORGE_NEXT_STANDALONE = $oldStandalone }
    }
  }
} catch {
  $stageFailure = $_
  throw
} finally {
  $env:GOCACHE = $oldGoCache
  $completedAt = [datetime]::UtcNow
  $reportOutput = [ordered]@{
    stage = 'legacy-baseline-release-operations'
    startedAt = $startedAt.ToString('o')
    completedAt = $completedAt.ToString('o')
    status = if ($stageFailure -or ($report.status -contains 'FAILED')) { 'FAILED' } elseif (($report.status -contains 'SKIPPED') -or $SkipDatabaseIntegration -or $SkipBuild) { 'PARTIAL' } else { 'PASSED' }
    failure = if ($stageFailure) { $stageFailure.Exception.Message } else { $null }
    databaseIntegrationSkipped = [bool]$SkipDatabaseIntegration
    productionBuildSkipped = [bool]$SkipBuild
    steps = $report
  }
  $absoluteReportPath = if ([System.IO.Path]::IsPathRooted($ReportPath)) { $ReportPath } else { Join-Path $repositoryRoot $ReportPath }
  $reportDirectory = Split-Path -Parent $absoluteReportPath
  if ($reportDirectory) { New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null }
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($absoluteReportPath, (($reportOutput | ConvertTo-Json -Depth 8) + "`n"), $encoding)
  Write-Host "Verification report: $absoluteReportPath"
}
