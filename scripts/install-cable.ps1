param([string]$Out)
$ErrorActionPreference = 'Stop'
function Write-Result($o) { ($o | ConvertTo-Json -Compress) | Set-Content -LiteralPath $Out -Encoding UTF8 }
function Test-Cable {
  $base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture'
  foreach ($k in (Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue)) {
    try {
      $st = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction Stop).DeviceState
      $p = Get-ItemProperty -LiteralPath (Join-Path $k.PSPath 'Properties') -ErrorAction Stop
      if ($st -eq 1 -and ([string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2') -like 'CABLE Output*' -and ([string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6') -like '*VB-Audio*') { return $true }
    } catch {}
  }
  return $false
}
try {
  if (Test-Cable) { Write-Result @{ ok = $true; already = $true }; exit }
  $url = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip'
  $dir = Join-Path $env:TEMP 'VanMule-VBCable'
  $zip = Join-Path $dir 'VBCABLE_Driver_Pack45.zip'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force
  $name = if ([Environment]::Is64BitOperatingSystem) { 'VBCABLE_Setup_x64.exe' } else { 'VBCABLE_Setup.exe' }
  $exe = Get-ChildItem -Path $dir -Recurse -Filter $name | Select-Object -First 1
  if (-not $exe) { throw "Could not find $name in the download." }
  $sig = Get-AuthenticodeSignature -FilePath $exe.FullName
  if ($sig.Status -ne 'Valid') { throw "The VB-Cable installer's signature is not valid ($($sig.Status)), so it was not run." }
  Start-Process -FilePath $exe.FullName -ArgumentList '-i', '-h' -Wait
  for ($i = 0; $i -lt 20; $i++) { if (Test-Cable) { break }; Start-Sleep -Seconds 1 }
  Write-Result @{ ok = $true; needsRestart = (-not (Test-Cable)) }
} catch {
  Write-Result @{ ok = $false; error = $_.Exception.Message }
}
