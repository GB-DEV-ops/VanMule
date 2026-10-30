# Exit 0 if the VB-Cable virtual microphone is installed, 1 if not.
$base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture'
foreach ($k in (Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue)) {
  try {
    $p = Get-ItemProperty -LiteralPath (Join-Path $k.PSPath 'Properties') -ErrorAction Stop
    if (([string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2') -like 'CABLE Output*' -and ([string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6') -like '*VB-Audio*') { exit 0 }
  } catch {}
}
exit 1
