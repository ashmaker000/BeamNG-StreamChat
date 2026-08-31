$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

Push-Location $repositoryRoot
try {
  npm run build --workspace companion
  npm run start --workspace companion
}
finally {
  Pop-Location
}
