$ErrorActionPreference = 'Stop'
$sandboxWorkspace = Split-Path -Parent $PSScriptRoot
$sandboxSource = Join-Path $sandboxWorkspace 'assets/sandbox/win32/SandboxRunner.cs'
$sandboxTarget = Join-Path $sandboxWorkspace 'assets/sandbox/win32/paper-pet-sandbox.exe'
$sandboxCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $sandboxCompiler)) { throw 'Windows .NET Framework C# compiler is unavailable.' }
& $sandboxCompiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll "/out:$sandboxTarget" $sandboxSource
if ($LASTEXITCODE -ne 0) { throw 'Sandbox launcher compilation failed.' }
Get-FileHash -LiteralPath $sandboxTarget -Algorithm SHA256
