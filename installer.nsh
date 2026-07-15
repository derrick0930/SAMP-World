!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var GtaSaDirPage
Var GtaSaDirText
Var GtaSaDirBrowseButton
Var GtaSaDirValue
Var DesktopShortcutCheckbox
Var DesktopShortcutChoice
Var FoundAppExeName

Function GtaSaDirPageCreate
  nsDialogs::Create 1018
  Pop $GtaSaDirPage
  ${If} $GtaSaDirPage == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Pilih folder instalasi GTA San Andreas (folder yang berisi gta_sa.exe). Ini bisa diubah lagi nanti lewat menu Setting di dalam launcher."
  Pop $0

  ${NSD_CreateText} 0 30u 70% 12u ""
  Pop $GtaSaDirText

  ${NSD_CreateButton} 73% 29u 27% 14u "Browse..."
  Pop $GtaSaDirBrowseButton
  ${NSD_OnClick} $GtaSaDirBrowseButton GtaSaDirBrowseOnClick

  ${NSD_CreateCheckbox} 0 55u 100% 12u "Buat shortcut SAMP World di Desktop"
  Pop $DesktopShortcutCheckbox
  ${NSD_SetState} $DesktopShortcutCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function GtaSaDirBrowseOnClick
  nsDialogs::SelectFolderDialog "Pilih folder instalasi GTA San Andreas" ""
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $GtaSaDirText "$0"
  ${EndIf}
FunctionEnd

Function GtaSaDirPageLeave
  ${NSD_GetText} $GtaSaDirText $GtaSaDirValue
  ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcutChoice

  ${If} $GtaSaDirValue == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "Folder GTA San Andreas belum dipilih. Kamu tetap bisa mengaturnya nanti lewat menu Setting di launcher."
    Return
  ${EndIf}

  IfFileExists "$GtaSaDirValue\gta_sa.exe" gtasa_found gtasa_not_found

  gtasa_not_found:
    MessageBox MB_ICONEXCLAMATION|MB_YESNO "gta_sa.exe tidak ditemukan di folder itu. Tetap lanjutkan tanpa mengatur directory sekarang?" IDYES gtasa_skip IDNO gtasa_retry
    gtasa_retry:
      Abort
    gtasa_skip:
      StrCpy $GtaSaDirValue ""
    Return

  gtasa_found:
    Return
FunctionEnd

!macro customWelcomePage
  !insertMacro MUI_PAGE_WELCOME
  Page custom GtaSaDirPageCreate GtaSaDirPageLeave
!macroend

!macro FindAppExeOnce
  ${If} $FoundAppExeName == ""
    FindFirst $9 $FoundAppExeName "$INSTDIR\*.exe"
    FindClose $9
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro FindAppExeOnce

  ${If} $GtaSaDirValue != ""
    CreateDirectory "$APPDATA\SAMP World"

    FileOpen $0 "$APPDATA\SAMP World\pending-gtasa-path.txt" w
    FileWrite $0 "$GtaSaDirValue"
    FileClose $0

    ${If} $FoundAppExeName != ""
      CreateShortCut "$GtaSaDirValue\Buka SAMP World.lnk" "$INSTDIR\$FoundAppExeName" "" "$INSTDIR\$FoundAppExeName" 0
    ${EndIf}
  ${EndIf}

  ${If} $DesktopShortcutChoice == ${BST_CHECKED}
    ${If} $FoundAppExeName != ""
      CreateShortCut "$DESKTOP\SAMP World.lnk" "$INSTDIR\$FoundAppExeName" "" "$INSTDIR\$FoundAppExeName" 0
    ${EndIf}
  ${EndIf}
!macroend
