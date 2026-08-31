param(
  [Parameter(Mandatory = $true)]
  [string]$UserFolder
)

$ErrorActionPreference = 'Stop'
$resolvedUserFolder = (Resolve-Path -LiteralPath $UserFolder).Path
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$source = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot 'beamng\ui\modules\apps\streamChat')).Path
$extensionSource = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot 'beamng\lua\ge\extensions\streamChatAuth.lua')).Path
$appsDirectory = Join-Path $resolvedUserFolder 'ui\modules\apps'
$destination = Join-Path $appsDirectory 'streamChat'
$extensionDirectory = Join-Path $resolvedUserFolder 'lua\ge\extensions'

New-Item -ItemType Directory -Path $appsDirectory -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force

$base64Path = Join-Path $destination 'app.png.base64'
$pngPath = Join-Path $destination 'app.png'
[IO.File]::WriteAllBytes($pngPath, [Convert]::FromBase64String((Get-Content -Raw -LiteralPath $base64Path).Trim()))
Remove-Item -LiteralPath $base64Path

New-Item -ItemType Directory -Path $extensionDirectory -Force | Out-Null
Copy-Item -LiteralPath $extensionSource -Destination (Join-Path $extensionDirectory 'streamChatAuth.lua') -Force

Write-Host "Installed Stream Chat UI app and login bridge to $resolvedUserFolder"
