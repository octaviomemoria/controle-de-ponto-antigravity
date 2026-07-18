$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$distDir = Join-Path $PSScriptRoot "dist"
$assetsDir = Join-Path $distDir "assets"

function Assert-LastExitCode([string] $step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step falhou com codigo $LASTEXITCODE."
  }
}

New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

# Tailwind build (uses apps/web/tailwind.config.cjs)
node (Join-Path $repoRoot "node_modules\\tailwindcss\\lib\\cli.js") `
  -c (Join-Path $PSScriptRoot "tailwind.config.cjs") `
  -i (Join-Path $PSScriptRoot "src\\styles\\tailwind.css") `
  -o (Join-Path $assetsDir "tailwind.css") `
  --minify | Out-Null
Assert-LastExitCode "Build do Tailwind"

# JS build (esbuild CLI - avoids esbuild Node API spawn issues in this environment)
$esbuildExe = Join-Path $repoRoot "node_modules\\@esbuild\\win32-x64\\esbuild.exe"
$defineNodeEnv = '--define:process.env.NODE_ENV=\"production\"'
$outDirArg = "--outdir=$assetsDir"
$entryNamesArg = "--entry-names=app"
$chunkNamesArg = "--chunk-names=chunks/[name]-[hash]"
& $esbuildExe (Join-Path $PSScriptRoot "src\\main.tsx") `
  --bundle `
  --format=esm `
  --splitting `
  --platform=browser `
  --jsx=automatic `
  --loader:.ts=ts `
  --loader:.tsx=tsx `
  $defineNodeEnv `
  $outDirArg `
  $entryNamesArg `
  $chunkNamesArg `
  --minify `
  --sourcemap | Out-Null
Assert-LastExitCode "Bundle do frontend"

# Public assets
Copy-Item -Force (Join-Path $PSScriptRoot "public\\favicon.svg") (Join-Path $distDir "favicon.svg")
Copy-Item -Force (Join-Path $PSScriptRoot "public\\pwa-192x192.png") (Join-Path $distDir "pwa-192x192.png")
Copy-Item -Force (Join-Path $PSScriptRoot "public\\pwa-512x512.png") (Join-Path $distDir "pwa-512x512.png")
Copy-Item -Force (Join-Path $PSScriptRoot "public\\manifest.webmanifest") (Join-Path $distDir "manifest.webmanifest")
Copy-Item -Force (Join-Path $PSScriptRoot "public\\sw.js") (Join-Path $distDir "sw.js")

$envFile = Join-Path $PSScriptRoot ".env"
$supabaseUrl = if ($env:VITE_SUPABASE_URL) { $env:VITE_SUPABASE_URL } else { "" }
$supabaseAnonKey = if ($env:VITE_SUPABASE_ANON_KEY) { $env:VITE_SUPABASE_ANON_KEY } else { "" }
$enableDemoMode = if ($env:VITE_ENABLE_DEMO_MODE) { $env:VITE_ENABLE_DEMO_MODE } else { "" }
if (Test-Path $envFile) {
  foreach ($line in (Get-Content $envFile)) {
    if ($line -match '^\s*#') { continue }
    if ($line -notmatch '=') { continue }
    $parts = $line.Split("=", 2)
    $k = $parts[0].Trim()
    $v = $parts[1].Trim().Trim('"')
    if ($k -eq "VITE_SUPABASE_URL") { $supabaseUrl = $v }
    if ($k -eq "VITE_SUPABASE_ANON_KEY") { $supabaseAnonKey = $v }
    if ($k -eq "VITE_ENABLE_DEMO_MODE") { $enableDemoMode = $v }
  }
}

$envJson = (@{
  VITE_SUPABASE_URL = $supabaseUrl
  VITE_SUPABASE_ANON_KEY = $supabaseAnonKey
  VITE_ENABLE_DEMO_MODE = $enableDemoMode
} | ConvertTo-Json -Compress)

"globalThis.__APP_ENV__ = $envJson;" | Set-Content -Encoding UTF8 (Join-Path $distDir "env.js")

$indexHtml = @"
<!doctype html>
<html lang="pt-BR" class="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Portal do Colaborador</title>
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f7f8" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#101922" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
    <script>
      (function () {
        try {
          const stored = localStorage.getItem("theme");
          const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
          const isDark = stored ? stored === "dark" : prefersDark;
          document.documentElement.classList.toggle("dark", isDark);
        } catch {}
      })();
    </script>
    <link rel="stylesheet" href="/assets/tailwind.css" />
  </head>
  <body class="bg-background-light font-display text-text-main antialiased dark:bg-background-dark dark:text-white overflow-x-hidden">
    <div id="root"></div>
    <script src="/env.js"></script>
    <script type="module" src="/assets/app.js"></script>
    <script>
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js");
      }
    </script>
  </body>
</html>
"@

$indexHtml | Set-Content -Encoding UTF8 (Join-Path $distDir "index.html")

Write-Host "Built apps/web/dist"
