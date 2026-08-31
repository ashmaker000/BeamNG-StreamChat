param(
  [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'artifacts\helper')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$buildDirectory = Join-Path $repositoryRoot 'companion\dist\sea'
$bundlePath = Join-Path $buildDirectory 'main.cjs'
$configPath = Join-Path $buildDirectory 'sea-config.json'
$blobPath = Join-Path $buildDirectory 'sea-prep.blob'
$executablePath = Join-Path $resolvedOutput 'BeamNGStreamChat.exe'
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

& (Join-Path $repositoryRoot 'node_modules\.bin\esbuild.cmd') (Join-Path $repositoryRoot 'companion\src\index.ts') --bundle --platform=node --format=cjs --target=node22 --outfile=$bundlePath
if ($LASTEXITCODE -ne 0) { throw 'esbuild failed' }

$seaConfig = @{
  main = $bundlePath
  output = $blobPath
  disableExperimentalSEAWarning = $true
  useSnapshot = $false
  useCodeCache = $false
} | ConvertTo-Json
[IO.File]::WriteAllText($configPath, $seaConfig, [Text.UTF8Encoding]::new($false))

& $nodeExecutable --experimental-sea-config $configPath
if ($LASTEXITCODE -ne 0) { throw 'Node SEA blob generation failed' }

Copy-Item -LiteralPath $nodeExecutable -Destination $executablePath -Force
& (Join-Path $repositoryRoot 'node_modules\.bin\postject.cmd') $executablePath NODE_SEA_BLOB $blobPath --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if ($LASTEXITCODE -ne 0) { throw 'Node SEA injection failed' }

Write-Host "Created standalone helper: $executablePath"
