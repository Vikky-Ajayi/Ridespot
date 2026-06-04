param(
  [int]$Port = 3003,
  [string]$Hostname = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root ".logs"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$logFile = Join-Path $logDir "next-start-$Port-$stamp.live.log"
$errFile = Join-Path $logDir "next-start-$Port-$stamp.err.log"

New-Item -ItemType Directory -Force $logDir | Out-Null
Set-Location $root

$env:NEXT_DIST_DIR = ".next-prod"

& "C:\Program Files\nodejs\node.exe" ".\node_modules\next\dist\bin\next" start --hostname $Hostname --port $Port 1>> $logFile 2>> $errFile
