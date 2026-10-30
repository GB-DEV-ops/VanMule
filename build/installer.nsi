Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APPNAME "VanMule"
!define EXE "VanMule.exe"
!define VERSION "3.23.3"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VanMule"

Name "${APPNAME}"
OutFile "..\dist\VanMule-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\VanMule"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "VanMule ${VERSION}"
VIProductVersion "3.23.3.0"
VIAddVersionKey "ProductName" "VanMule"
VIAddVersionKey "FileDescription" "VanMule Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "VanMule"
VIAddVersionKey "LegalCopyright" ""

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install VanMule"
!define MUI_WELCOMEPAGE_TEXT "VanMule is a real-time voice changer and soundboard.$\r$\n$\r$\nSetup also installs VB-Cable, a free virtual microphone by VB-Audio, so Discord and games can hear your changed voice. Windows will ask for permission once for it.$\r$\n$\r$\nClick Next to install."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open VanMule"
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_SHOW WelcomeInstallButton
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function WelcomeInstallButton
FunctionEnd

; /UPDATE = silent in-app update: keep shortcuts as they are, skip the cable step, reopen VanMule after.
Var IsUpdate
Function .onInit
  StrCpy $IsUpdate "0"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  IfErrors +2
  StrCpy $IsUpdate "1"
FunctionEnd

Section "Install"
  ; Close a running copy so files can be replaced.
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  ; Remove the previous app (it was called Vox Forge). Its settings, voices and sounds move over on first launch.
  nsExec::Exec 'taskkill /IM "Vox Forge.exe" /F'
  Sleep 500
  IfFileExists "$LOCALAPPDATA\Programs\Vox Forge\Uninstall Vox Forge.exe" 0 no_old
    DetailPrint "Removing the old Vox Forge app..."
    ExecWait '"$LOCALAPPDATA\Programs\Vox Forge\Uninstall Vox Forge.exe" /S _?=$LOCALAPPDATA\Programs\Vox Forge'
    RMDir /r "$LOCALAPPDATA\Programs\Vox Forge"
  no_old:
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VoxForge"
  Delete "$SMPROGRAMS\Vox Forge.lnk"
  Delete "$DESKTOP\Vox Forge.lnk"
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "..\dist\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Uninstall VanMule.exe"
  CreateDirectory "$SMPROGRAMS"
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  StrCmp $IsUpdate "1" +2
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "VanMule"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall VanMule.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" $0
SectionEnd

Var CableResult
Section "Virtual microphone"
  DetailPrint "Checking for the VB-Cable virtual microphone..."
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\check-cable.ps1"'
  Pop $0
  StrCmp $0 "0" cable_present
  StrCmp $IsUpdate "1" 0 +3
  StrCpy $CableResult "0"
  Goto cable_done
  DetailPrint "Installing VB-Cable (Windows will ask for permission)..."
  Delete "$TEMP\vanmule-cable-setup.json"
  System::Call 'Kernel32::SetEnvironmentVariable(t "VAN_S", t "$INSTDIR\resources\scripts\install-cable.ps1")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "VAN_O", t "$TEMP\vanmule-cable-setup.json")i'
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\elevate.ps1"'
  Pop $0
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { $$r = Get-Content -Raw -LiteralPath $$env:TEMP\vanmule-cable-setup.json | ConvertFrom-Json } catch { exit 1 }; if (-not $$r.ok) { exit 1 }; if ($$r.needsRestart) { exit 2 }; exit 0"'
  Pop $CableResult
  StrCmp $CableResult "0" cable_done
  StrCmp $CableResult "2" cable_done
  MessageBox MB_OK|MB_ICONEXCLAMATION "VB-Cable could not be installed right now (permission declined or no internet).$\r$\n$\r$\nVanMule will offer to install it again the first time it opens."
  Goto cable_done
  cable_present:
  DetailPrint "VB-Cable is already installed."
  StrCpy $CableResult "0"
  cable_done:
SectionEnd

Function .onInstSuccess
  StrCmp $IsUpdate "1" 0 +3
  Exec '"$INSTDIR\${EXE}" --updated'
  Return
  StrCmp $CableResult "2" 0 +3
  MessageBox MB_YESNO|MB_ICONQUESTION "VB-Cable was installed. Windows needs a restart before the virtual microphone appears.$\r$\n$\r$\nRestart now?" IDNO +2
  Reboot
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Sleep 800
  ; Give the real microphone back as the Windows default.
  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\audio.ps1" -Action restore'
  MessageBox MB_YESNO|MB_ICONQUESTION "Also remove the VB-Cable virtual microphone (CABLE Input and CABLE Output)?$\r$\n$\r$\nChoose No if other apps use it." /SD IDNO IDNO skip_cable
  System::Call 'Kernel32::SetEnvironmentVariable(t "VAN_S", t "$INSTDIR\resources\scripts\uninstall-cable.ps1")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "VAN_O", t "$TEMP\vanmule-cable-remove.json")i'
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\elevate.ps1"'
  skip_cable:
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.voxforge.app"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VanMule"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
