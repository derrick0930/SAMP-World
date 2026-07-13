; installer.nsh
; Custom NSIS untuk SA:MP World installer.
;
; PENTING soal urutan halaman NSIS + electron-builder:
;   Halaman bawaan (Welcome/Directory/Instfiles/Finish) untuk assisted installer
;   didefinisikan di file template electron-builder yang di-include SEBELUM
;   macro "customHeader" dipanggil. Jadi "Page custom ..." yang ditaruh di
;   customHeader akan selalu nempel di PALING AKHIR (setelah Finish) -- itu
;   penyebab bug sebelumnya (halaman kita cuma punya Back/Close/Cancel, dan
;   $GtaSaDirValue masih kosong saat proses install berjalan).
;
;   Titik insersi yang BENAR untuk menambah halaman ekstra SEBELUM
;   Directory/Instfiles/Finish adalah macro "customWelcomePage" -- macro ini
;   didukung resmi oleh electron-builder dan dieksekusi tepat sebelum halaman
;   Directory. Makanya di bawah kita insert MUI_PAGE_WELCOME + Page custom kita
;   di dalam customWelcomePage.
;
; Alur final: Welcome -> [Pilih Directory GTA SA + checkbox Desktop shortcut]
;             -> Directory (folder instalasi app) -> Instfiles (proses install,
;             di titik ini customInstall jalan, $GtaSaDirValue SUDAH terisi)
;             -> Finish (ada checkbox "Run SAMP World" bawaan electron-builder)
;
; Cara pakai: taruh file ini di root project (sejajar package.json), lalu di
; package.json > build > nsis tambahkan:
;   "include": "installer.nsh"
; Dan set "createDesktopShortcut": false (supaya tidak dibuat otomatis tanpa
; nanya -- kita yang bikin manual di customInstall sesuai checkbox pengguna).

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var GtaSaDirPage
Var GtaSaDirText
Var GtaSaDirBrowseButton
Var GtaSaDirValue
Var DesktopShortcutCheckbox
Var DesktopShortcutChoice
Var FoundAppExeName

; ---- Halaman custom: pilih folder GTA SA + checkbox desktop shortcut ----
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

; ---- Titik insersi resmi electron-builder untuk halaman tambahan sebelum
; Directory/Instfiles/Finish. Welcome page memang tidak ditambahkan otomatis
; oleh assisted installer kecuali macro ini didefinisikan, jadi kita insert
; MUI_PAGE_WELCOME juga di sini supaya alurnya tetap lengkap dari awal. ----
!macro customWelcomePage
  !insertMacro MUI_PAGE_WELCOME
  Page custom GtaSaDirPageCreate GtaSaDirPageLeave
!macroend

; ---- Cari nama exe utama launcher di $INSTDIR sekali saja, dipakai untuk
; shortcut GTA SA maupun shortcut Desktop. Tidak diasumsikan namanya persis
; karena productName mengandung karakter ":" yang tidak valid untuk nama file
; Windows (electron-builder otomatis membuang/mengganti karakter itu). ----
!macro FindAppExeOnce
  ${If} $FoundAppExeName == ""
    FindFirst $9 $FoundAppExeName "$INSTDIR\*.exe"
    FindClose $9
  ${EndIf}
!macroend

; ---- Setelah file ter-install: tulis file penanda + shortcut di folder GTA SA
; + (opsional) shortcut Desktop sesuai checkbox pengguna ----
!macro customInstall
  !insertmacro FindAppExeOnce

  ${If} $GtaSaDirValue != ""
    CreateDirectory "$APPDATA\SAMP World"

    ; File penanda plain-text, satu baris = path apa adanya (tanpa escaping).
    ; Dibaca & dihapus oleh main.js saat launcher pertama kali dibuka.
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
