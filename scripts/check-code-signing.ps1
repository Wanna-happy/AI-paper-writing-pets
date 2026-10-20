param([string]$CertificateThumbprint = '')
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Code-signing certificate checks require Windows.' }
$signingCertificates = @(
  Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert
  Get-ChildItem Cert:\LocalMachine\My -CodeSigningCert
)
$requestedThumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
if ($requestedThumbprint -and $requestedThumbprint -notmatch '^[0-9A-F]{40}$') { throw 'Certificate thumbprint must contain exactly 40 hexadecimal characters.' }
$certificateReport = @($signingCertificates | ForEach-Object {
  [PSCustomObject]@{
    Subject = $_.Subject
    Thumbprint = $_.Thumbprint
    Store = $_.PSParentPath
    NotBefore = $_.NotBefore
    NotAfter = $_.NotAfter
    HasPrivateKey = $_.HasPrivateKey
    TimeValid = ($_.NotBefore -le (Get-Date) -and $_.NotAfter -gt (Get-Date))
  }
})
if (-not $requestedThumbprint) {
  if (-not $certificateReport.Count) { Write-Output 'No code-signing certificate found. Obtain a publicly trusted code-signing certificate and connect its token or vendor client first.' }
  else { $certificateReport | Format-Table Subject, Thumbprint, NotAfter, HasPrivateKey, TimeValid -AutoSize }
  Write-Output 'This check does not export private keys, prove public trust, or perform a signing operation.'
  return
}
$selectedCertificate = @($certificateReport | Where-Object { $_.Thumbprint -eq $requestedThumbprint })
if (-not $selectedCertificate.Count) { throw 'Requested code-signing certificate was not found in the Windows Personal certificate stores.' }
if (-not @($selectedCertificate | Where-Object { $_.HasPrivateKey -and $_.TimeValid }).Count) { throw 'The selected certificate is expired, not yet valid, or has no accessible private-key association. Connect the token or sign in to the vendor client.' }
Write-Output ('Certificate precheck passed: ' + $requestedThumbprint)
Write-Output 'The signing provider may still request a PIN or mobile approval. Trust and actual signatures are checked after packaging.'
