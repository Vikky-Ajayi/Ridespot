param(
  [int]$Port = 3003,
  [string]$Hostname = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root ".logs"
$distDir = ".next-dev-$Port"
$distPath = Join-Path $root $distDir
$stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$logFile = Join-Path $logDir "next-dev-$Port-$stamp.live.log"
$errFile = Join-Path $logDir "next-dev-$Port-$stamp.err.log"

New-Item -ItemType Directory -Force $logDir | Out-Null
if (Test-Path $distPath) {
  Remove-Item -LiteralPath $distPath -Recurse -Force
}
Set-Location $root

$env:NEXT_DIST_DIR = $distDir

& "C:\Program Files\nodejs\node.exe" ".\node_modules\next\dist\bin\next" dev --hostname $Hostname --port $Port 1>> $logFile 2>> $errFile
