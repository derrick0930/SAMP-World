# SA:MP World

<p align="center">
  <img src="https://raw.githubusercontent.com/derrick0930/SAMP-World/refs/heads/main/assets/logo.png" alt="SA:MP World Logo" width="256">
</p>

Launcher desktop untuk server **SA-MP** yang dibangun menggunakan **ElectronJS** dengan **HTML, CSS, dan Vanilla JavaScript** (tanpa framework frontend seperti React/Vue/Angular, dan tanpa Bootstrap/Tailwind).

Launcher mendukung **multi-server**: pengguna dapat menambah, menghapus, dan memilih server SA-MP sendiri dari daftar. Setiap server yang ditambahkan akan langsung divalidasi dan di-query informasinya (nama server, jumlah player, gamemode, map, versi, ping, dsb) secara langsung ke server tujuan menggunakan **UDP socket (`dgram`)**, mengikuti SA-MP Query Mechanism — tanpa bergantung pada API endpoint eksternal mana pun.

Launcher juga dilengkapi fitur **Setting Directory GTA SA** (ikon gear) untuk mengatur lokasi folder instalasi GTA San Andreas tempat `samp.exe` berada, integrasi **Discord Rich Presence**, serta sistem **logging** internal untuk membantu troubleshooting.

---

## Struktur Project

```
SAMP-World/
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

Selain itu, saat dijalankan, launcher akan membuat beberapa file konfigurasi/log secara otomatis di folder `userData` Electron (di Windows biasanya `%APPDATA%\SA:MP World\`):

- `config.json` — menyimpan directory GTA SA, username terakhir yang dipakai, dan preferensi tema (dark/light).
- `servers.json` — menyimpan daftar server SA-MP yang ditambahkan pengguna.
- `SAMP-World.txt` — file log aplikasi.

---

## Requirement

- Node.js versi 18 LTS atau lebih baru
- npm (sudah termasuk dalam instalasi Node.js)
- Sistem operasi untuk build target Windows: **Debian Linux** (menggunakan Wine untuk proses packaging NSIS)
- Aplikasi Discord Desktop berjalan di background (untuk fitur Discord Rich Presence)
- Koneksi jaringan yang mengizinkan komunikasi **UDP** keluar (digunakan untuk query informasi server)
- Beberapa fitur (penulisan nickname ke Windows Registry, deteksi proses `gta_sa.exe` untuk Discord Rich Presence) hanya aktif di platform **Windows**; di platform lain fitur tersebut otomatis dilewati tanpa error

---

## Install Dependency

Masuk ke folder project, lalu jalankan:

```
npm install
```

Perintah ini akan mengunduh `electron`, `electron-builder`, dan `@xhayper/discord-rpc` sesuai yang sudah didefinisikan di `package.json`. Query informasi server memakai modul bawaan Node.js `dgram`, sehingga tidak ada dependency tambahan yang diperlukan untuk fitur ini.

---

## Menjalankan Launcher (Mode Development)

```
npm start
```

Perintah ini akan membuka window Electron berukuran 900x550 dengan tampilan launcher.

---

## Build ke Windows (SA:MP-World-Setup.exe dan SA:MP-World-Portable.exe)

```
npm run dist
```

Perintah ini akan menghasilkan installer NSIS (`SA:MP-World-Setup.exe`) dan versi portable (`SA:MP-World-Portable.exe`) sekaligus dalam satu kali build, karena target `win` pada `electron-builder` sudah dikonfigurasi dengan dua target: `nsis` dan `portable`.

Hasil build akan berada di folder:

```
dist/
```

Isi folder `dist/` setelah build selesai antara lain:

```
dist/SA:MP-World-Setup.exe
dist/SA:MP-World-Portable.exe
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
cd SAMP-World
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
- Membuat installer NSIS (`SA:MP-World-Setup.exe`).
- Membuat versi portable (`SA:MP-World-Portable.exe`).
- Menggunakan Wine untuk proses signing/packaging resource `.exe` di lingkungan Linux.

### 9. Ambil Hasil Build

Setelah proses build selesai, file hasil build dapat ditemukan di:

```
dist/SA:MP-World-Setup.exe
dist/SA:MP-World-Portable.exe
```

File-file tersebut siap didistribusikan dan dijalankan di Windows x64.

---

## Fitur Multi-Server

Pengguna dapat mengelola daftar server SA-MP mereka sendiri langsung dari UI launcher:

1. Pengguna menambahkan server baru dengan memasukkan **host/IP** dan **port**.
2. Sebelum server ditambahkan ke daftar, launcher terlebih dahulu melakukan query UDP ke server tersebut untuk memastikan server benar-benar bisa dihubungi. Jika server tidak merespons, penambahan akan ditolak dengan pesan error.
3. Server yang sudah ada di daftar tidak bisa ditambahkan dua kali (dicek berdasarkan kombinasi host + port).
4. Pengguna dapat **menghapus** server dari daftar.
5. Setiap server pada daftar dapat di-refresh statusnya secara langsung (nama server, jumlah player online, gamemode, dsb) lewat query UDP.
6. Pengguna memilih salah satu server dari daftar sebelum menekan **Play**.

### Implementasi Teknis

- Daftar server disimpan secara permanen di `servers.json` (terpisah dari `config.json`), pada lokasi `userData` Electron, dalam bentuk array `{ host, port }`.
- Operasi dijembatani lewat IPC handler:
  - `get-servers` — mengambil seluruh daftar server tersimpan.
  - `add-server` — memvalidasi host/port, mengecek duplikat, melakukan query UDP untuk memastikan server hidup, baru kemudian menyimpan ke `servers.json`.
  - `remove-server` — menghapus entri server dari `servers.json`.
  - `get-server-status` — melakukan query UDP on-demand ke satu server untuk mendapatkan status terbaru.

---

## Query Informasi Server (UDP)

Informasi tiap server (nama server, jumlah player, gamemode, map, versi, ping) **tidak diambil dari API endpoint eksternal mana pun**. Launcher melakukan query langsung ke server SA-MP menggunakan **UDP socket** lewat modul bawaan Node.js, `dgram`, mengikuti SA-MP Query Mechanism.

### Implementasi Teknis

- Query dikirim dari proses main (`main.js`) menggunakan `dgram.createSocket("udp4")`. Paket query dibentuk sesuai format protokol SA-MP: signature `"SAMP"`, 4 byte IP, 2 byte port (little-endian), dan 1 byte opcode.
- Dua jenis opcode digunakan:
  - Opcode **`i`** (*information*) — mengembalikan status password, jumlah player online, kapasitas maksimum, nama server (hostname), gamemode, dan nama map.
  - Opcode **`r`** (*rules*) — mengembalikan pasangan key-value rules server, digunakan untuk mengambil versi server.
- Setiap request memiliki timeout (default 1.5 detik); jika server tidak merespons dalam batas waktu tersebut, query dianggap gagal (server dianggap tidak terjangkau) tanpa membuat launcher freeze.
- Waktu round-trip request dicatat sebagai **ping** ke server tersebut.
- Hasil query info + rules digabung menjadi satu objek status server (`connected`, `serverName`, `gamemode`, `version`, `online`, `max`, `ping`) yang dikirim ke renderer lewat IPC.
- Karena query dilakukan langsung dari launcher ke server tujuan, tidak diperlukan backend/API perantara untuk mendapatkan informasi server.

---

## Fitur Setting Directory GTA SA

Sebelum menjalankan SA-MP, pengguna wajib mengatur lokasi folder instalasi GTA San Andreas terlebih dahulu:

1. Klik ikon **gear** di pojok kanan atas window launcher.
2. Klik tombol **Browse**, lalu pilih folder instalasi GTA San Andreas (folder yang berisi `samp.exe`) melalui dialog folder native Windows.
3. Klik **Save**.
4. Launcher akan memvalidasi bahwa directory ada dan `samp.exe` benar-benar ditemukan di dalamnya. Jika tidak valid, akan muncul pesan error dan pengaturan tidak akan disimpan.
5. Jika valid, directory akan disimpan secara permanen ke `config.json`, sehingga pengaturan tetap tersimpan meskipun launcher ditutup dan dibuka kembali.

Jika pengguna menekan **Play** tanpa terlebih dahulu mengatur directory GTA SA, launcher akan menampilkan pesan error yang mengarahkan pengguna untuk mengatur directory lewat menu Setting terlebih dahulu.

### Implementasi Teknis

- Pemilihan folder menggunakan dialog native Electron: `dialog.showOpenDialog` dengan `properties: ["openDirectory"]`, dipanggil dari proses main lewat IPC handler `select-directory`.
- Penyimpanan dan pembacaan pengaturan dilakukan lewat IPC handler `save-settings` dan `get-settings`, dijembatani secara aman ke renderer lewat `contextBridge` di `preload.js`.
- `config.json` juga menyimpan preferensi **tema** (dark/light) lewat IPC handler `save-theme`, dan **username terakhir** yang dipakai untuk login, agar bisa diisikan otomatis di percobaan berikutnya.

---

## Menjalankan SA-MP (Play / Connect)

Saat pengguna menekan **Play** pada server yang dipilih dan memasukkan username, launcher melakukan langkah berikut lewat IPC handler `launch-samp`:

1. Validasi username: hanya boleh huruf, angka, underscore, dan tanda kurung siku `[ ]`, dengan panjang 3–20 karakter.
2. Validasi bahwa directory GTA SA sudah diatur dan `samp.exe` ada di dalamnya.
3. Di Windows, nickname yang dipilih pengguna ditulis ke Windows Registry (`HKCU\SOFTWARE\SAMP\PlayerName`) menggunakan `reg.exe`, agar terbaca oleh SA-MP. Di platform selain Windows, langkah ini otomatis dilewati.
4. Username yang dipakai disimpan ke `config.json` sebagai `lastUsername`.
5. `samp.exe` dijalankan menggunakan `child_process.spawn` dengan argumen `host:port` dari server yang dipilih, dan `cwd` diarahkan ke folder GTA SA agar dependency game (data, models, dsb) dapat terbaca dengan benar:
   ```
   samp.exe <host>:<port>
   ```
6. Proses dijalankan secara `detached` sehingga tidak terikat pada siklus hidup launcher.
7. Setelah berhasil terhubung, launcher mulai memantau status server aktif untuk keperluan Discord Rich Presence (lihat bagian berikutnya).

---

## Fitur Discord Rich Presence

Launcher terintegrasi dengan **Discord Rich Presence** menggunakan library `@xhayper/discord-rpc`, sehingga aktivitas pengguna (sedang bermain di server mana, jumlah player, dsb) tampil otomatis di profil Discord mereka.

### Implementasi Teknis

- Koneksi RPC diinisialisasi di `main.js` menggunakan `Client` dari `@xhayper/discord-rpc` dengan transport `"ipc"`, memakai Client ID aplikasi Discord yang dikonfigurasi lewat konstanta di `main.js` (tidak disertakan di README ini).
- RPC hanya aktif jika Discord Desktop terdeteksi berjalan di background; jika tidak terdeteksi, launcher tetap berjalan normal tanpa error. Jika koneksi terputus, launcher otomatis mencoba reconnect secara berkala.
- Saat pengguna berhasil connect ke server, activity Discord diisi dengan nama server, alamat `host:port`, waktu mulai sesi, logo aplikasi, serta jumlah player online/maksimum.
- Activity di-refresh otomatis secara berkala selama sesi berjalan, dengan meng-query ulang status server yang sedang aktif lewat UDP.
- Launcher memantau proses `gta_sa.exe` di background (khusus Windows, lewat `tasklist`) untuk mendeteksi kapan game benar-benar ditutup pengguna, lalu otomatis menghapus Discord Rich Presence saat proses game sudah tidak berjalan.
- Presence juga otomatis dibersihkan saat aplikasi launcher ditutup, agar status tidak "menggantung" di profil Discord pengguna.

---

## Sistem Logging

Launcher mencatat log internal untuk membantu troubleshooting, tersimpan di file `SAMP-World.txt`.

### Implementasi Teknis

- Lokasi file log: di dalam folder GTA SA yang sudah diatur pengguna (jika ada), atau folder `userData` Electron jika belum diatur.
- Setiap baris log berisi timestamp (ISO), level (`INFO`/`WARN`/`ERROR`), dan pesan.
- Jika ukuran file log melebihi 2MB, isi file akan dikosongkan otomatis (log rotation sederhana) sebelum menulis entri baru.

---

## Catatan Penting

- File `samp.exe` **tidak disertakan** dalam project ini karena merupakan file resmi dari game client GTA: San Andreas multiplayer (SA-MP) dan bukan bagian dari source code launcher. Launcher akan menjalankan `samp.exe` dari folder yang diatur pengguna lewat menu **Setting**.
- Informasi server (nama, jumlah player, gamemode, versi) didapat langsung lewat query UDP (`dgram`) ke masing-masing server, **bukan** lewat API endpoint eksternal.
- Nickname yang dikirim ke SA-MP tidak lagi dilewatkan sebagai argumen command line, melainkan ditulis ke Windows Registry sebelum `samp.exe` dijalankan (khusus Windows).
- Semua komunikasi antara proses main dan renderer menggunakan IPC (`ipcMain.handle` / `ipcRenderer.invoke`) yang dijembatani secara aman lewat `preload.js` menggunakan `contextBridge`.
- Window launcher berukuran tetap **900x550**, tidak resizable, dan tidak bisa fullscreen (`fullscreenable: false`, `resizable: false`, `maximizable: false`).
- Fitur Discord Rich Presence, penulisan nickname ke registry, dan pemantauan proses game bersifat opsional/non-blocking dan tidak akan menghentikan jalannya launcher jika tidak tersedia (misalnya di platform non-Windows atau Discord tidak aktif).

---

## Teknologi yang Digunakan

- [Electron](https://www.electronjs.org/) — framework untuk membangun aplikasi desktop lintas platform menggunakan JavaScript.
- [Electron Builder](https://www.electron.build/) — tool untuk packaging dan build installer aplikasi Electron.
- [@xhayper/discord-rpc](https://www.npmjs.com/package/@xhayper/discord-rpc) — library untuk integrasi Discord Rich Presence.
- `dgram` (modul bawaan Node.js) — untuk query informasi server SA-MP lewat UDP.
- HTML5, CSS3, dan Vanilla JavaScript (ES6+) — tanpa framework frontend tambahan.

---

## Lisensi

MIT License — bebas digunakan dan dimodifikasi.