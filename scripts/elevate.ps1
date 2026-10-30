# Runs install-cable.ps1 as administrator. Paths arrive through environment variables to avoid quoting problems.
$q = [char]34
try {
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + $q + $env:VAN_S + $q + ' -Out ' + $q + $env:VAN_O + $q)
  exit 0
} catch {
  exit 5
}
