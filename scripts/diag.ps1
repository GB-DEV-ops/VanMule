param([string]$Action = 'all', [string]$TestFile = '', [string]$Dirs = '')
# VanMule diagnostics: prints one line of JSON.
$ErrorActionPreference = 'SilentlyContinue'
$r = [ordered]@{ ok = $true }

function Read-DiscordVoice {
  $out = [ordered]@{ found = $false }
  $roots = @('discord', 'discordptb', 'discordcanary') | ForEach-Object { Join-Path $env:APPDATA "$_\Local Storage\leveldb" } | Where-Object { Test-Path $_ }
  $best = $null; $bestTime = [datetime]::MinValue
  foreach ($root in $roots) {
    $files = Get-ChildItem -LiteralPath $root -File | Where-Object { $_.Extension -in '.log', '.ldb' } | Sort-Object LastWriteTime
    foreach ($f in $files) {
      try { $bytes = [IO.File]::ReadAllBytes($f.FullName) } catch { continue }
      $texts = @([Text.Encoding]::GetEncoding(28591).GetString($bytes), [Text.Encoding]::Unicode.GetString($bytes))
      foreach ($t in $texts) {
        $ms = [regex]::Matches($t, '"inputDeviceId":"([^"]{0,200})"')
        if ($ms.Count -gt 0 -and $f.LastWriteTime -ge $bestTime) {
          $m = $ms[$ms.Count - 1]; $start = [Math]::Max(0, $m.Index - 1500); $len = [Math]::Min($t.Length - $start, 3000)
          $best = @{ text = $t.Substring($start, $len); input = $m.Groups[1].Value; file = $f.Name }; $bestTime = $f.LastWriteTime
        }
      }
    }
  }
  if ($best) {
    $out.found = $true; $out.inputDeviceId = $best.input
    foreach ($k in 'noiseSuppression', 'noiseCancellation', 'echoCancellation', 'automaticGainControl') {
      $mm = [regex]::Matches($best.text, '"' + $k + '":(true|false)')
      if ($mm.Count -gt 0) { $out[$k] = ($mm[$mm.Count - 1].Groups[1].Value -eq 'true') }
    }
    $mm = [regex]::Matches($best.text, '"mode":"([A-Z_]+)"'); if ($mm.Count -gt 0) { $out.mode = $mm[$mm.Count - 1].Groups[1].Value }
  }
  $out.running = @(Get-Process -Name Discord, DiscordPTB, DiscordCanary -ErrorAction SilentlyContinue).Count -gt 0
  $out.installed = $roots.Count -gt 0
  return $out
}

switch ($Action) {
  'discord' { $r.discord = Read-DiscordVoice }
  'clipboard' {
    try {
      Set-Clipboard -LiteralPath $TestFile
      $got = Get-Clipboard -Format FileDropList
      $r.clipboard = [ordered]@{ ok = (@($got | ForEach-Object { $_.FullName }) -contains $TestFile) }
    } catch { $r.clipboard = [ordered]@{ ok = $false; error = $_.Exception.Message } }
  }
  default {
    $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $r.os = [ordered]@{ name = $cv.ProductName; display = $cv.DisplayVersion; build = [int]$cv.CurrentBuild; ubr = $cv.UBR }
    $cs = Get-CimInstance Win32_ComputerSystem
    $r.ramGB = [Math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
    $r.cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
    $r.gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
      $vram = $null
      try {
        foreach ($k in Get-ChildItem 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}') {
          $p = Get-ItemProperty $k.PSPath
          if ($p.DriverDesc -eq $_.Name -and $p.'HardwareInformation.qwMemorySize') { $vram = [Math]::Round([double]$p.'HardwareInformation.qwMemorySize' / 1GB, 1) }
        }
      } catch {}
      [ordered]@{ name = $_.Name; driver = $_.DriverVersion; vramGB = $(if ($vram) { $vram } else { [Math]::Round([double]$_.AdapterRAM / 1GB, 1) }) }
    })
    $r.disks = @()
    foreach ($d in ($Dirs -split '\|')) {
      if (-not $d) { continue }
      try { $root = [IO.Path]::GetPathRoot($d); $di = New-Object IO.DriveInfo($root); $r.disks += [ordered]@{ path = $d; drive = $root; freeGB = [Math]::Round($di.AvailableFreeSpace / 1GB, 1) } } catch {}
    }
    $r.discord = Read-DiscordVoice
  }
}
$r | ConvertTo-Json -Compress -Depth 6
