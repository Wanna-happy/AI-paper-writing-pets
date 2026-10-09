param([ValidateSet('preview', 'signed')][string]$Mode = 'preview', [switch]$SkipTests, [string]$ValidateOnly = '')
$ErrorActionPreference = 'Stop'
$releaseRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
Set-Location -LiteralPath $releaseRoot
$releaseNode = (Get-Command node -ErrorAction Stop).Source
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot '.local-runtime/npm/package/bin/npm-cli.js'))) { throw 'npm is required for electron-builder. Install Node.js/npm or prepare the local npm runtime.' }
  $releaseNpmBin = Join-Path $releaseRoot '.local-runtime/npm/launcher'
  New-Item -ItemType Directory -Path $releaseNpmBin -Force | Out-Null
  @('@echo off', 'node "%~dp0..\package\bin\npm-cli.js" %*') | Set-Content -LiteralPath (Join-Path $releaseNpmBin 'npm.cmd') -Encoding ascii
  $env:PATH = $releaseNpmBin + [IO.Path]::PathSeparator + $env:PATH
}
if ($Mode -eq 'signed' -and -not ($env:WIN_CSC_LINK -or $env:CSC_LINK)) { throw 'Signed release requires your trusted code-signing certificate via WIN_CSC_LINK or CSC_LINK. No unsigned fallback is permitted.' }
$releaseOutput = if ($ValidateOnly) { [IO.Path]::GetFullPath((Join-Path $releaseRoot $ValidateOnly)) } else { Join-Path $releaseRoot ('release-' + $Mode + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
if (-not ([IO.Path]::GetFullPath($releaseOutput).StartsWith($releaseRoot + [IO.Path]::DirectorySeparatorChar))) { throw 'Release output must remain within the workspace.' }
& $releaseNode scripts/audit-dependencies.cjs
if ($LASTEXITCODE -ne 0) { throw 'Dependency audit failed or shipped high/critical vulnerabilities remain.' }
& $releaseNode scripts/audit-python-runtime.cjs
if ($LASTEXITCODE -ne 0) { throw 'Bundled Python audit failed.' }
if (-not $SkipTests) {
  & $releaseNode scripts/test-all.js
  if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed.' }
}
if (-not $ValidateOnly) {
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-sandbox.ps1
if ($LASTEXITCODE -ne 0) { throw 'Sandbox build failed.' }
$releaseArguments = @('node_modules/electron-builder/cli.js', '--win', 'nsis', '--x64', '--publish', 'never', ('-c.directories.output=' + $releaseOutput))
if ($Mode -eq 'signed') { $releaseArguments += '-c.forceCodeSigning=true' }
else { $releaseArguments += @('-c.forceCodeSigning=false', '-c.win.signExecutable=false', '-c.nsis.artifactName=AI-paper-pet-PREVIEW-UNSIGNED-${version}.${ext}') }
& $releaseNode @releaseArguments
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }
}
$releaseInstaller = @(Get-ChildItem -LiteralPath $releaseOutput -Filter '*.exe' -File)
if ($releaseInstaller.Count -ne 1) { throw 'Expected exactly one installer.' }
$releaseAppDirectory = Join-Path $releaseOutput 'win-unpacked'
$releaseExecutables = @(Get-ChildItem -LiteralPath $releaseAppDirectory -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll', '.pyd', '.node' }) + $releaseInstaller
$releaseSignatures = @($releaseExecutables | ForEach-Object {
  $releaseSignature = Get-AuthenticodeSignature -LiteralPath $_.FullName
  [PSCustomObject]@{ file = $_.FullName.Substring($releaseOutput.Length + 1); status = $releaseSignature.Status.ToString(); publisher = $releaseSignature.SignerCertificate.Subject }
})
if ($Mode -eq 'signed' -and @($releaseSignatures | Where-Object { $_.status -ne 'Valid' }).Count) { throw 'Signed release contains an invalid or unsigned executable component.' }
$releaseDefender = Join-Path $env:ProgramFiles 'Windows Defender/MpCmdRun.exe'
if (-not (Test-Path -LiteralPath $releaseDefender)) { throw 'Microsoft Defender scanner is unavailable; installer is not approved for upload.' }
& $releaseDefender -Scan -ScanType 3 -File $releaseAppDirectory -DisableRemediation
if ($LASTEXITCODE -ne 0) { throw 'Defender app scan did not pass. Installer is not approved for upload.' }
& $releaseDefender -Scan -ScanType 3 -File $releaseInstaller[0].FullName -DisableRemediation
if ($LASTEXITCODE -ne 0) { throw 'Defender installer scan did not pass. Installer is not approved for upload.' }
$releaseHash = Get-FileHash -LiteralPath $releaseInstaller[0].FullName -Algorithm SHA256
[IO.File]::WriteAllText((Join-Path $releaseOutput 'SHA256SUMS.txt'), ($releaseHash.Hash.ToLower() + '  ' + $releaseInstaller[0].Name + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath '.release-checks/dependency-audit.json' -Destination (Join-Path $releaseOutput 'dependency-audit.json')
Copy-Item -LiteralPath '.release-checks/python-dependency-audit.json' -Destination (Join-Path $releaseOutput 'python-dependency-audit.json')
Copy-Item -LiteralPath (Join-Path $releaseAppDirectory 'resources/package-content-report.json') -Destination (Join-Path $releaseOutput 'package-content-report.json')
[PSCustomObject]@{ version = (Get-Content -LiteralPath 'package.json' -Raw -Encoding utf8 | ConvertFrom-Json).version; mode = $Mode; signed = ($Mode -eq 'signed'); testsRun = (-not $SkipTests); defenderScan = 'passed'; signatures = $releaseSignatures; sha256 = $releaseHash.Hash; checkedAt = (Get-Date).ToUniversalTime().ToString('o'); browserWarningsMayRemain = $true } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $releaseOutput 'release-report.json') -Encoding utf8
Write-Output ('Validated installer: ' + $releaseInstaller[0].FullName)
if ($Mode -eq 'preview') { Write-Warning 'This is an unsigned preview. Do not describe it as signed or promise that SmartScreen warnings will disappear.' }
