# SAMP Launcher

Launcher desktop untuk server **NelloW Roleplay** (SA-MP) yang dibangun menggunakan **ElectronJS** dengan **HTML, CSS, dan Vanilla JavaScript** (tanpa framework frontend seperti React/Vue/Angular, dan tanpa Bootstrap/Tailwind).

Launcher ini menampilkan informasi server (nama, status, IP, jumlah player), dan saat tombol **Play** ditekan akan muncul popup untuk memasukkan username, lalu menjalankan `samp.exe` dengan command line:

```
samp.exe 127.0.0.1:7777 PlayerName
```

Launcher juga dilengkapi fitur **Setting Directory GTA SA** (ikon gear di pojok kanan atas) untuk mengatur lokasi folder instalasi GTA San Andreas tempat `samp.exe` berada, sehingga launcher tahu executable mana yang harus dijalankan.

---

## Struktur Project

```
samp-launcher/
│
├── package.json
├── main.js
├── preload.js
├── renderer/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── assets/
│   ├── icon.ico
│   └── logo.png
└── README.md
```

---

## Requirement

- Node.js versi 18 LTS atau lebih baru
- npm (sudah termasuk dalam instalasi Node.js)
- Sistem operasi untuk build target Windows: **Debian Linux** (menggunakan Wine untuk proses packaging NSIS)

---

## Install Dependency

Masuk ke folder project, lalu jalankan:

```
npm install
```

Perintah ini akan mengunduh `electron` dan `electron-builder` sesuai yang sudah didefinisikan di `package.json`.

---

## Menjalankan Launcher (Mode Development)

```
npm start
```

Perintah ini akan membuka window Electron berukuran 900x550 dengan tampilan launcher NelloW Roleplay.

---

## Build ke Windows (Setup.exe dan Portable.exe)

```
npm run dist
```

Perintah ini akan menghasilkan installer NSIS (`Setup.exe`) dan versi portable (`Portable.exe`) sekaligus dalam satu kali build, karena target `win` pada `electron-builder` sudah dikonfigurasi dengan dua target: `nsis` dan `portable`.

Hasil build akan berada di folder:

```
dist/
```

Isi folder `dist/` setelah build selesai antara lain:

```
dist/Setup.exe
dist/Portable.exe
```

---

## Panduan Build di Debian Linux (Lengkap)

Berikut adalah langkah-langkah lengkap untuk melakukan build aplikasi Windows x64 di sistem **Debian Linux** menggunakan **Electron Builder**.

### 1. Update Sistem

```
sudo apt update
sudo apt upgrade -y
```

### 2. Install Node.js dan npm

Debian bawaan biasanya memiliki versi Node.js yang lama, disarankan menggunakan NodeSource repository:

```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Cek versi yang terinstall:

```
node -v
npm -v
```

### 3. Install Build Essential (diperlukan oleh beberapa native dependency)

```
sudo apt install -y build-essential
```

### 4. Install Wine (diperlukan Electron Builder untuk build target Windows dari Linux)

Aktifkan arsitektur 32-bit terlebih dahulu:

```
sudo dpkg --add-architecture i386
sudo apt update
```

Install Wine:

```
sudo apt install -y wine wine32 wine64
```

Cek instalasi Wine:

```
wine --version
```

### 5. Install Dependency Tambahan (mono dan libgnutls, opsional namun direkomendasikan agar proses NSIS berjalan lancar)

```
sudo apt install -y mono-complete
sudo apt install -y libgnutls30
```

### 6. Masuk ke Folder Project

```
cd samp-launcher
```

### 7. Install Dependency Project (Electron dan Electron Builder)

```
npm install
```

### 8. Jalankan Build untuk Windows x64

```
npm run dist
```

Electron Builder akan otomatis:

- Membundle aplikasi menggunakan Electron untuk platform Windows x64.
- Membuat installer NSIS (`Setup.exe`).
- Membuat versi portable (`Portable.exe`).
- Menggunakan Wine untuk proses signing/packaging resource `.exe` di lingkungan Linux.

### 9. Ambil Hasil Build

Setelah proses build selesai, file hasil build dapat ditemukan di:

```
dist/Setup.exe
dist/Portable.exe
```

File-file tersebut siap didistribusikan dan dijalankan di Windows x64.

---

## Fitur Setting Directory GTA SA

Sebelum menjalankan SA-MP, pengguna wajib mengatur lokasi folder instalasi GTA San Andreas terlebih dahulu:

1. Klik ikon **gear** di pojok kanan atas window launcher.
2. Klik tombol **Browse**, lalu pilih folder instalasi GTA San Andreas (folder yang berisi `samp.exe`) melalui dialog folder native Windows.
3. Klik **Save**.
4. Launcher akan memvalidasi bahwa `samp.exe` benar-benar ada di dalam folder tersebut. Jika tidak ditemukan, akan muncul pesan error dan pengaturan tidak akan disimpan.
5. Jika valid, directory akan disimpan secara permanen ke file `config.json` yang berada di folder data aplikasi (`app.getPath("userData")`), sehingga pengaturan tetap tersimpan meskipun launcher ditutup dan dibuka kembali.

Jika pengguna menekan tombol **Play** lalu **Connect** tanpa terlebih dahulu mengatur directory GTA SA, launcher akan menampilkan pesan error yang mengarahkan pengguna untuk mengatur directory lewat menu Setting terlebih dahulu.

### Implementasi Teknis

- Konfigurasi disimpan dalam bentuk JSON di `config.json`, pada lokasi standar `userData` Electron (di Windows biasanya berada di `%APPDATA%\SAMP Launcher\config.json` setelah aplikasi di-package).
- Pemilihan folder menggunakan dialog native Electron: `dialog.showOpenDialog` dengan `properties: ["openDirectory"]`, dipanggil dari proses main melalui IPC handler `select-directory`.
- Penyimpanan dan pembacaan pengaturan dilakukan lewat IPC handler `save-settings` dan `get-settings`, keduanya dijembatani secara aman ke renderer lewat `contextBridge` di `preload.js` (`window.sampLauncher.saveSettings()` dan `window.sampLauncher.getSettings()`).
- Saat tombol **Connect** ditekan, `main.js` akan membaca `config.json`, menggabungkan directory yang tersimpan dengan `samp.exe`, memvalidasi keberadaan file tersebut, lalu menjalankannya menggunakan `child_process.spawn` dengan `cwd` diarahkan ke folder GTA SA agar dependency game (data, models, dsb) dapat terbaca dengan benar oleh `samp.exe`.

## Catatan Penting

- File `samp.exe` **tidak disertakan** dalam project ini karena merupakan file resmi dari game client GTA: San Andreas multiplayer (SA-MP) dan bukan bagian dari source code launcher. Launcher akan menjalankan `samp.exe` dari folder yang diatur pengguna lewat menu **Setting**.
- Command line yang dijalankan oleh launcher mengikuti format resmi SA-MP:
  ```
  samp.exe 127.0.0.1:7777 PlayerName
  ```
- Proses menjalankan `samp.exe` menggunakan `child_process.spawn` dari Node.js, dipanggil dari `main.js` melalui IPC (`ipcMain.handle` / `ipcRenderer.invoke`) yang dijembatani secara aman lewat `preload.js` menggunakan `contextBridge`.
- Window launcher berukuran tetap **900x550**, tidak resizable, dan tidak bisa fullscreen (`fullscreenable: false`, `resizable: false`, `maximizable: false`).

---

## Teknologi yang Digunakan

- [Electron](https://www.electronjs.org/) — framework untuk membangun aplikasi desktop lintas platform menggunakan JavaScript.
- [Electron Builder](https://www.electron.build/) — tool untuk packaging dan build installer aplikasi Electron.
- HTML5, CSS3, dan Vanilla JavaScript (ES6+) — tanpa framework frontend tambahan.

---

## Lisensi

MIT License — bebas digunakan dan dimodifikasi untuk keperluan komunitas NelloW Roleplay.
