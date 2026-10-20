param([ValidateSet('preview', 'signed')][string]$Mode = 'preview', [switch]$SkipTests, [string]$ValidateOnly = '', [string]$CertificateThumbprint = '')
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
if ($CertificateThumbprint -and $Mode -ne 'signed') { throw 'CertificateThumbprint is only supported in signed release mode.' }
if ($Mode -eq 'signed' -and -not $ValidateOnly) {
  if ($CertificateThumbprint) {
    if ($env:WIN_CSC_LINK -or $env:CSC_LINK) { throw 'Choose one signing identity: clear WIN_CSC_LINK/CSC_LINK before selecting a certificate-store thumbprint.' }
    $CertificateThumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'check-code-signing.ps1') -CertificateThumbprint $CertificateThumbprint
    if ($LASTEXITCODE -ne 0) { throw 'Signing certificate precheck failed.' }
  } elseif (-not ($env:WIN_CSC_LINK -or $env:CSC_LINK)) { throw 'Signed release requires a trusted signing identity. Use -CertificateThumbprint for a connected token/vendor client, or WIN_CSC_LINK/CSC_LINK for an existing compatible certificate file. Run scripts/check-code-signing.ps1 first. No unsigned fallback is permitted.' }
  if ($env:ELECTRON_BUILDER_OFFLINE -eq 'true') { throw 'Signed releases require online timestamping; clear ELECTRON_BUILDER_OFFLINE before signing.' }
}
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
if ($Mode -eq 'signed') {
  $releaseArguments += '-c.forceCodeSigning=true'
  if ($CertificateThumbprint) { $releaseArguments += ('-c.win.signtoolOptions.certificateSha1=' + $CertificateThumbprint) }
}
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
$releaseVersion = (Get-Content -LiteralPath 'package.json' -Raw -Encoding utf8 | ConvertFrom-Json).version
$releaseNotice = if ($Mode -eq 'preview') { '此为未签名测试版。Windows/浏览器可能显示未知发布者或信誉提示，部分设备策略可能阻止安装。遇到拦截请反馈完整提示，不要关闭杀毒软件。' } else { '此版本已检查代码签名；有效签名不保证所有设备均不出现信誉提示。' }
$releaseInstallGuide = @"
AI论文宠物 $releaseVersion 安装说明

安装包：$($releaseInstaller[0].Name)
系统：Windows 10 1703+ / Windows 11，x64。
运行安装包，按向导选择位置；无需安装 Node.js、Python、Word 或 Excel。
内置分析环境需要额外磁盘空间，首次初始化可能较慢。

$releaseNotice

首次使用：打开设置 → AI 配置，填写自己的模型服务 API Key 并测试连接，再创建项目、导入资料并发起对话。
AI 请求会产生模型服务费用；必要任务文本、相关历史、资料片段及工具结果会发送到配置的服务商。本地保存不等于完全离线。
上传原件只读；重要资料请保留独立备份。升级前在项目成果中备份项目，不要删除用户数据目录。
分析结果和论文需要人工核验；试用版本不保证自动生成合格终稿。

校验：在 PowerShell 中执行 Get-FileHash -Algorithm SHA256 -LiteralPath '安装包完整路径'，与 SHA256SUMS.txt 比较。
反馈：说明版本、Windows版本、操作步骤及错误截图；请遮盖敏感信息，不提交API Key、论文原文、身份证件或数据库。
源代码与反馈：https://github.com/Wanna-happy/AI-paper-writing-pets
"@
[IO.File]::WriteAllText((Join-Path $releaseOutput 'INSTALL.txt'), $releaseInstallGuide, [Text.UTF8Encoding]::new($true))
Write-Output ('Validated installer: ' + $releaseInstaller[0].FullName)
if ($Mode -eq 'preview') { Write-Warning 'This is an unsigned preview. Do not describe it as signed or promise that SmartScreen warnings will disappear.' }
