param(
  [string]$UserFolder,
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\BeamNGStreamChat'),
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'BeamNGStreamChat'),
  [switch]$NoStart,
  [switch]$NoRegister,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$version = '0.5.0'
$payloadRoot = $PSScriptRoot
$helperSource = Join-Path $payloadRoot 'BeamNGStreamChat.exe'
$modSource = Join-Path $payloadRoot 'BeamNG-StreamChat.zip'

if (-not (Test-Path -LiteralPath $helperSource) -or -not (Test-Path -LiteralPath $modSource)) {
  throw 'The installer payload is incomplete.'
}

if (-not $UserFolder) {
  $defaultUserFolder = Join-Path $env:LOCALAPPDATA 'BeamNG\BeamNG.drive\current'
  if (Test-Path -LiteralPath $defaultUserFolder) {
    $UserFolder = $defaultUserFolder
  } else {
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object Windows.Forms.FolderBrowserDialog
    $picker.Description = 'Select your active BeamNG.drive user folder'
    $picker.ShowNewFolderButton = $false
    if ($picker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'BeamNG user folder selection was cancelled.' }
    $UserFolder = $picker.SelectedPath
  }
}

$resolvedUserFolder = [IO.Path]::GetFullPath($UserFolder)
$resolvedInstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$localAppDataRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
if (-not (Test-Path -LiteralPath $resolvedUserFolder)) { throw 'The selected BeamNG user folder does not exist.' }
if (-not $resolvedInstallRoot.StartsWith($localAppDataRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The helper must be installed under the current user LocalAppData folder.'
}

$modsDirectory = Join-Path $resolvedUserFolder 'mods'
$settingsDirectory = Join-Path $resolvedUserFolder 'settings\BeamNGStreamChat'
$dataDirectory = [IO.Path]::GetFullPath($DataRoot)
if (-not $dataDirectory.StartsWith($localAppDataRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The service data must be stored under the current user LocalAppData folder.'
}
$backupDirectory = Join-Path $dataDirectory 'backup'
$helperDestination = Join-Path $resolvedInstallRoot 'BeamNGStreamChat.exe'
$launcherPath = Join-Path $resolvedInstallRoot 'launch-hidden.vbs'
$uninstallerPath = Join-Path $resolvedInstallRoot 'Uninstall.ps1'
$installedMod = Join-Path $modsDirectory 'BeamNG-StreamChat.zip'

New-Item -ItemType Directory -Path $modsDirectory,$settingsDirectory,$dataDirectory,$backupDirectory,$resolvedInstallRoot -Force | Out-Null

Get-CimInstance Win32_Process -Filter "Name='BeamNGStreamChat.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $helperDestination } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Get-ChildItem -LiteralPath $modsDirectory -Filter 'BeamNG-StreamChat-*.zip' -File -ErrorAction SilentlyContinue |
  ForEach-Object {
    $backupName = "{0}-{1}{2}" -f $_.BaseName,(Get-Date -Format 'yyyyMMddHHmmss'),$_.Extension
    Move-Item -LiteralPath $_.FullName -Destination (Join-Path $backupDirectory $backupName)
  }

Copy-Item -LiteralPath $helperSource -Destination $helperDestination -Force
Copy-Item -LiteralPath $modSource -Destination $installedMod -Force
Copy-Item -LiteralPath (Join-Path $payloadRoot 'uninstall-release.ps1') -Destination $uninstallerPath -Force
Copy-Item -LiteralPath (Join-Path $payloadRoot 'CREDITS.md') -Destination $resolvedInstallRoot -Force
Copy-Item -LiteralPath (Join-Path $payloadRoot 'THIRD_PARTY_NOTICES.md') -Destination $resolvedInstallRoot -Force
Copy-Item -LiteralPath (Join-Path $payloadRoot 'Node.js-LICENSE.txt') -Destination $resolvedInstallRoot -Force
Copy-Item -LiteralPath (Join-Path $payloadRoot 'Postject-LICENSE.txt') -Destination $resolvedInstallRoot -Force

$keyBytes = [byte[]]::new(32)
$keyGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $keyGenerator.GetBytes($keyBytes)
} finally {
  $keyGenerator.Dispose()
}
$ipcKey = [Convert]::ToBase64String($keyBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
[IO.File]::WriteAllText((Join-Path $dataDirectory 'ipc-key'), $ipcKey, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $settingsDirectory 'ipc.json'), (@{ key = $ipcKey } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))

$escapedHelper = $helperDestination.Replace('"', '""')
$newline = [Environment]::NewLine
$launcher = 'Set shell = CreateObject("WScript.Shell")' + $newline + 'shell.Run Chr(34) & "' + $escapedHelper + '" & Chr(34), 0, False' + $newline
[IO.File]::WriteAllText($launcherPath, $launcher, [Text.UTF8Encoding]::new($false))

if (-not $NoRegister) {
  $quotedLauncher = 'wscript.exe "' + $launcherPath + '"'
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  New-Item -Path $runKey -Force | Out-Null
  New-ItemProperty -Path $runKey -Name 'BeamNGStreamChat' -Value $quotedLauncher -PropertyType String -Force | Out-Null

  $uninstallCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $uninstallerPath + '" -UserFolder "' + $resolvedUserFolder + '"'
  $uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\BeamNGStreamChat'
  New-Item -Path $uninstallKey -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name DisplayName -Value 'BeamNG Twitch Chat' -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name DisplayVersion -Value $version -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name Publisher -Value 'Ashmaker000' -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name InstallLocation -Value $resolvedInstallRoot -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name UninstallString -Value $uninstallCommand -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
}

if (-not $NoStart) {
  Start-Process -FilePath 'wscript.exe' -ArgumentList @($launcherPath) -WindowStyle Hidden
}

if (-not $Quiet) {
  Add-Type -AssemblyName PresentationFramework
  [Windows.MessageBox]::Show('BeamNG Twitch Chat is installed. Add the Twitch Chat app from BeamNG UI Apps, then enter your Twitch Client ID.', 'BeamNG Twitch Chat', 'OK', 'Information') | Out-Null
}
