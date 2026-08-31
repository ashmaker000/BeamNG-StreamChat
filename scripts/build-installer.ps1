$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$artifacts = Join-Path $repositoryRoot 'artifacts'
$payload = Join-Path $artifacts 'installer'
$helperOutput = Join-Path $payload 'helper'
$payloadArchive = Join-Path $artifacts 'installer-payload.zip'
$installerPath = Join-Path $artifacts 'BeamNG-StreamChat-Setup.exe'

if (Test-Path -LiteralPath $payload) {
  Remove-Item -LiteralPath $payload -Recurse -Force
}
if (Test-Path -LiteralPath $payloadArchive) {
  Remove-Item -LiteralPath $payloadArchive -Force
}

& (Join-Path $PSScriptRoot 'package-beamng.ps1')
& (Join-Path $PSScriptRoot 'build-helper.ps1') -OutputDirectory $helperOutput

New-Item -ItemType Directory -Path $payload -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $helperOutput 'BeamNGStreamChat.exe') -Destination (Join-Path $payload 'BeamNGStreamChat.exe') -Force
Copy-Item -LiteralPath (Join-Path $artifacts 'BeamNG-StreamChat.zip') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-release.ps1') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall-release.ps1') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'CREDITS.md') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'THIRD_PARTY_NOTICES.md') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'licenses\Node.js-LICENSE.txt') -Destination $payload -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'licenses\Postject-LICENSE.txt') -Destination $payload -Force

Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $payloadArchive -CompressionLevel Optimal

$runtimeDirectory = [Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$compiler = Join-Path $runtimeDirectory 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
  throw 'The .NET Framework C# compiler is unavailable.'
}
if (Test-Path -LiteralPath $installerPath) {
  Remove-Item -LiteralPath $installerPath -Force
}

$compilerArguments = @(
  '/nologo',
  '/target:winexe',
  '/optimize+',
  ('/out:"' + $installerPath + '"'),
  '/reference:System.Windows.Forms.dll',
  '/reference:System.IO.Compression.dll',
  '/reference:System.IO.Compression.FileSystem.dll',
  ('/resource:"' + $payloadArchive + '",BeamNGStreamChat.Payload.zip'),
  (Join-Path $PSScriptRoot 'setup-bootstrap.cs')
)
& $compiler $compilerArguments
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $installerPath)) {
  throw 'The standalone installer build failed.'
}

Write-Host "Created one-click installer: $installerPath"
