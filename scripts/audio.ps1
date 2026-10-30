param([string]$Action = 'status', [string]$Id = '')
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace VanMule {
  [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    [PreserveSig] int GetMixFormat();
    [PreserveSig] int GetDeviceFormat();
    [PreserveSig] int ResetDeviceFormat();
    [PreserveSig] int SetDeviceFormat();
    [PreserveSig] int GetProcessingPeriod();
    [PreserveSig] int SetProcessingPeriod();
    [PreserveSig] int GetShareMode();
    [PreserveSig] int SetShareMode();
    [PreserveSig] int GetPropertyValue();
    [PreserveSig] int SetPropertyValue();
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
    [PreserveSig] int SetEndpointVisibility();
  }
  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] public class PolicyConfigClient { }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, out IntPtr iface);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumerator { }
  public static class Endpoints {
    public static string GetDefault(int flow, int role) {
      var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice d;
      if (e.GetDefaultAudioEndpoint(flow, role, out d) != 0 || d == null) return "";
      string id; d.GetId(out id); return id ?? "";
    }
    public static int SetDefault(string id, int role) {
      var p = (IPolicyConfig)new PolicyConfigClient();
      return p.SetDefaultEndpoint(id, role);
    }
  }
}
'@

function Get-Endpoints([string]$Kind) {
  $prefix = if ($Kind -eq 'Capture') { '{0.0.1.00000000}.' } else { '{0.0.0.00000000}.' }
  $base = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$Kind"
  $list = @()
  foreach ($k in (Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue)) {
    try {
      $state = (Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction Stop).DeviceState
      $p = Get-ItemProperty -LiteralPath (Join-Path $k.PSPath 'Properties') -ErrorAction Stop
      $list += [pscustomobject]@{
        id = $prefix + $k.PSChildName
        name = [string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
        iface = [string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
        active = ($state -eq 1)
      }
    } catch {}
  }
  return $list
}
function Test-IsCable($e) { return ($e.name -like 'CABLE*' -and $e.iface -like '*VB-Audio*') }

switch ($Action) {
  'status' {
    $cap = @(Get-Endpoints 'Capture' | Where-Object { $_.active })
    $cable = $cap | Where-Object { $_.name -like 'CABLE Output*' -and $_.iface -like '*VB-Audio*' } | Select-Object -First 1
    $mics = @($cap | Where-Object { -not (Test-IsCable $_) } | ForEach-Object { @{ id = $_.id; name = "$($_.name) ($($_.iface))" } })
    $def = [VanMule.Endpoints]::GetDefault(1, 0)
    $com = [VanMule.Endpoints]::GetDefault(1, 2)
    $cableId = if ($cable) { $cable.id } else { '' }
    @{
      ok = $true; installed = [bool]$cable; cableId = $cableId
      defaultId = $def; commsId = $com
      defaultIsCable = [bool]($cable -and ($def -eq $cableId))
      mics = $mics
    } | ConvertTo-Json -Compress -Depth 5
  }
  'set' {
    if (-not $Id) { throw 'No device id given.' }
    $r = 0
    foreach ($role in 0, 1, 2) { $h = [VanMule.Endpoints]::SetDefault($Id, $role); if ($h -ne 0) { $r = $h } }
    @{ ok = ($r -eq 0); hr = $r } | ConvertTo-Json -Compress
  }
  'restore' {
    # Make a real microphone the default again if the virtual cable is the default.
    $cap = @(Get-Endpoints 'Capture' | Where-Object { $_.active })
    $def = [VanMule.Endpoints]::GetDefault(1, 0)
    $cur = $cap | Where-Object { $_.id -eq $def } | Select-Object -First 1
    if ($cur -and (Test-IsCable $cur)) {
      $real = $cap | Where-Object { -not (Test-IsCable $_) } | Select-Object -First 1
      if ($real) { foreach ($role in 0, 1, 2) { [void][VanMule.Endpoints]::SetDefault($real.id, $role) } }
    }
    @{ ok = $true } | ConvertTo-Json -Compress
  }
  default { @{ ok = $false; error = "Unknown action: $Action" } | ConvertTo-Json -Compress }
}
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
