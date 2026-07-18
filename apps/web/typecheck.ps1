$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$tsConfigPath = Join-Path $PSScriptRoot "tsconfig.json"
$tscPath = Join-Path $repoRoot "node_modules\typescript\lib\tsc.js"

node $tscPath --noEmit --pretty false --project $tsConfigPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
