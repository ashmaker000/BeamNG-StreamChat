$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$source = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot 'beamng')).Path
$artifactDirectory = Join-Path $repositoryRoot 'artifacts'
$archivePath = Join-Path $artifactDirectory 'BeamNG-StreamChat.zip'
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stagingRoot = Join-Path $tempRoot ("beamng-stream-chat-package-" + [guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $stagingRoot -Recurse -Force
  $appDirectory = Join-Path $stagingRoot 'ui\modules\apps\streamChat'

  $base64Path = Join-Path $appDirectory 'app.png.base64'
  $pngPath = Join-Path $appDirectory 'app.png'
  [IO.File]::WriteAllBytes($pngPath, [Convert]::FromBase64String((Get-Content -Raw -LiteralPath $base64Path).Trim()))
  Remove-Item -LiteralPath $base64Path

  New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath }
  Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
  Write-Host "Created $archivePath"
}
finally {
  $resolvedStagingRoot = [IO.Path]::GetFullPath($stagingRoot)
  if ($resolvedStagingRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and $resolvedStagingRoot -ne $tempRoot) {
    if (Test-Path -LiteralPath $resolvedStagingRoot) {
      Remove-Item -LiteralPath $resolvedStagingRoot -Recurse -Force
    }
  }
}
