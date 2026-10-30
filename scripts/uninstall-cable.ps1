param([string]$Out)
# Removes the VB-Cable virtual audio devices and their driver using Windows' own tools (pnputil). Runs as administrator.
$ErrorActionPreference = 'Stop'
function Write-Result($o) { ($o | ConvertTo-Json -Compress) | Set-Content -LiteralPath $Out -Encoding UTF8 }
try {
  $devices = 0
  try {
    Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like '*VB-Audio Virtual Cable*' -or $_.Manufacturer -like '*VB-Audio*' } | ForEach-Object {
      pnputil /remove-device "$($_.InstanceId)" | Out-Null; $devices++
    }
  } catch {}
  $infs = @()
  try {
    $infs = @(Get-WindowsDriver -Online -ErrorAction Stop | Where-Object { $_.ProviderName -like '*VB-Audio*' -or $_.OriginalFileName -like '*vbmmecable*' -or $_.OriginalFileName -like '*vbaudio_cable*' } | ForEach-Object { $_.Driver })
  } catch {
    $cur = @{}
    foreach ($l in @(pnputil /enum-drivers) + '') {
      if ($l -match '^\s*$') { if ($cur.pub -and ($cur.vb)) { $infs += $cur.pub }; $cur = @{} }
      elseif ($l -match '(oem\d+\.inf)') { if (-not $cur.pub) { $cur.pub = $Matches[1] } }
      if ($l -match 'VB-Audio|vbmmecable|vbaudio_cable') { $cur.vb = $true }
    }
  }
  $infs = @($infs | Select-Object -Unique)
  foreach ($i in $infs) { pnputil /delete-driver $i /uninstall /force | Out-Null }
  Write-Result @{ ok = $true; drivers = $infs.Count; devices = $devices; found = (($infs.Count + $devices) -gt 0); needsRestart = (($infs.Count + $devices) -gt 0) }
} catch {
  Write-Result @{ ok = $false; error = $_.Exception.Message }
}
