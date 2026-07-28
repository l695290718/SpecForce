param(
  [string]$GatewayImage = "specforge/graph-gateway:local",
  [string]$ProjectorImage = "specforge/graph-projector:local",
  [switch]$Pull
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$builds = @(
  @{
    Dockerfile = Join-Path $repositoryRoot "deploy\\graph-gateway.Dockerfile"
    Image = $GatewayImage
  },
  @{
    Dockerfile = Join-Path $repositoryRoot "deploy\\graph-projector.Dockerfile"
    Image = $ProjectorImage
  }
)

foreach ($build in $builds) {
  $arguments = @(
    "build",
    "--file", $build.Dockerfile,
    "--tag", $build.Image
  )
  if ($Pull) {
    $arguments += "--pull"
  }
  $arguments += $repositoryRoot

  & docker @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Image build failed for $($build.Image) with exit code $LASTEXITCODE."
  }
}
