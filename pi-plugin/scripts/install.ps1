# Install this plugin into a target project:
#   ./install.ps1 -Target D:\path\to\your-project [-Force]
param(
  [Parameter(Position = 0)][string]$Target = ".",
  [switch]$Force
)
$ErrorActionPreference = "Stop"

$src = (Resolve-Path (Join-Path $PSScriptRoot "..\.pi")).Path
$dst = Join-Path $Target ".pi"

if (Test-Path $dst) {
  if (-not $Force) {
    throw "$dst already exists; pass -Force to overwrite (or merge manually)"
  }
  Remove-Item -Recurse -Force $dst
}
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Recurse -Force (Join-Path $src "*") $dst

Write-Host "Installed pi-project-learning to $dst"
Write-Host "Next: cd $Target; pi --approve; then run /ask"
