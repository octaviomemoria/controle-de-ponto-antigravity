$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$npmCommand = if ($IsWindows) { "npm.cmd" } else { "npm" }

Push-Location $repoRoot
try {
  & $npmCommand run typecheck:web
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & $npmCommand run build:web
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & $npmCommand run smoke:api
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
