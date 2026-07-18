$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $repoRoot ".dev"
$stdoutPath = Join-Path $logDir "smoke-api.stdout.log"
$stderrPath = Join-Path $logDir "smoke-api.stderr.log"
$port = if ($env:SMOKE_API_PORT) { $env:SMOKE_API_PORT } else { "3302" }
$previousPort = $env:PORT

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Remove-Item $stdoutPath -ErrorAction SilentlyContinue
Remove-Item $stderrPath -ErrorAction SilentlyContinue

$env:PORT = $port
$apiProcess = Start-Process node `
  -ArgumentList "apps/api/src/index.js" `
  -WorkingDirectory $repoRoot `
  -PassThru `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath

try {
  $healthUrl = "http://127.0.0.1:$port/api/health"
  $readyUrl = "http://127.0.0.1:$port/api/ready"
  $healthResponse = $null
  $readyResponse = $null

  for ($attempt = 1; $attempt -le 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $healthResponse = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
      $readyResponse = Invoke-RestMethod -Uri $readyUrl -TimeoutSec 3
      if ($healthResponse.status -eq "ok" -and $readyResponse.status -eq "ready") {
        break
      }
    } catch {
      if ($apiProcess.HasExited) {
        break
      }
    }
  }

  if (
    -not $healthResponse -or
    $healthResponse.status -ne "ok" -or
    -not $readyResponse -or
    $readyResponse.status -ne "ready"
  ) {
    $stdout = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { "" }
    $stderr = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { "" }
    throw "Smoke test da API falhou em $healthUrl e $readyUrl.`nHealth:`n$($healthResponse | ConvertTo-Json -Compress)`nReady:`n$($readyResponse | ConvertTo-Json -Compress)`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
  }

  Write-Host "Smoke test da API OK em $healthUrl e $readyUrl"
} finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force
    Wait-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousPort) {
    $env:PORT = $previousPort
  } else {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  }
}
