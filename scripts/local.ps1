[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$Preview,
  [int]$Port = 5173,
  [int]$PreviewPort = 4173
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install Node.js and npm, then retry."
  }
}

function Invoke-Step {
  param(
    [string]$Title,
    [string]$FilePath,
    [string[]]$Arguments = @()
  )

  Write-Host ""
  Write-Host "==> $Title"
  & $FilePath @Arguments

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Assert-Command "node"
Assert-Command "npm"

if (-not $SkipInstall) {
  if (Test-Path "package-lock.json") {
    Invoke-Step "Installing dependencies from package-lock.json" "npm" @("ci")
  }
  else {
    Invoke-Step "Installing dependencies" "npm" @("install")
  }
}

if (-not $SkipBuild) {
  Invoke-Step "Building production assets" "npm" @("run", "build")
}

if ($Preview) {
  Invoke-Step "Starting local production preview at http://localhost:$PreviewPort" "npm" @("run", "preview", "--", "--host", "0.0.0.0", "--port", "$PreviewPort")
}
else {
  Invoke-Step "Starting local dev server at http://localhost:$Port" "npm" @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$Port")
}
