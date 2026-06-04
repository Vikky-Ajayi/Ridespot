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
$outFile = Join-Path $logDir "next-dev-$Port-$stamp.out.log"
$errFile = Join-Path $logDir "next-dev-$Port-$stamp.err.log"
$node = "C:\Program Files\nodejs\node.exe"
$nextBin = Join-Path $root "node_modules\next\dist\bin\next"
$cmd = "C:\Windows\System32\cmd.exe"

New-Item -ItemType Directory -Force $logDir | Out-Null
if (Test-Path $distPath) {
  Remove-Item -LiteralPath $distPath -Recurse -Force
}

if (-not (Test-Path $node)) {
  $node = "node"
}

$childCommand = "set `"NEXT_DIST_DIR=$distDir`"&& set `"NEXT_PUBLIC_DISABLE_PWA=true`"&& `"$node`" `"$nextBin`" dev --hostname `"$Hostname`" --port `"$Port`" 1>> `"$outFile`" 2>> `"$errFile`""

$process = Start-Process `
  -FilePath $cmd `
  -ArgumentList @("/d", "/c", $childCommand) `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

[pscustomobject]@{
  pid = $process.Id
  port = $Port
  hostname = $Hostname
  stdoutPath = $outFile
  stderrPath = $errFile
} | ConvertTo-Json
