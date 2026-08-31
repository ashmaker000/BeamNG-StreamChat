param(
  [Parameter(Mandatory = $true)]
  [string]$UserFolder
)

$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\BeamNGStreamChat'))
$dataDirectory = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'BeamNGStreamChat'))
$resolvedUserFolder = [IO.Path]::GetFullPath($UserFolder)
$modsDirectory = Join-Path $resolvedUserFolder 'mods'
$settingsDirectory = Join-Path $resolvedUserFolder 'settings\BeamNGStreamChat'

Get-CimInstance Win32_Process -Filter "Name='BeamNGStreamChat.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($installRoot, [StringComparison]::OrdinalIgnoreCase) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'BeamNGStreamChat' -ErrorAction SilentlyContinue
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BeamNGStreamChat' -Recurse -Force -ErrorAction SilentlyContinue

Get-ChildItem -LiteralPath $modsDirectory -Filter 'BeamNG-StreamChat-*.zip' -File -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
$currentMod = Join-Path $modsDirectory 'BeamNG-StreamChat.zip'
if (Test-Path -LiteralPath $currentMod -PathType Leaf) { Remove-Item -LiteralPath $currentMod -Force }
if (Test-Path -LiteralPath $settingsDirectory) { Remove-Item -LiteralPath $settingsDirectory -Recurse -Force }
if (Test-Path -LiteralPath $dataDirectory) { Remove-Item -LiteralPath $dataDirectory -Recurse -Force }
if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
