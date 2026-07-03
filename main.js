const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { Client: DiscordRpcClient } = require("@xhayper/discord-rpc");

let mainWindow = null;

const DISCORD_CLIENT_ID = "ganti id lo";

let discordClient = null;
let discordReady = false;
let activityStartTimestamp = null;

function initDiscordRpc() {
  if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID.indexOf("PASTE_") === 0) {
    console.log("Discord Rich Presence dilewati: DISCORD_CLIENT_ID belum diisi.");
    return;
  }

  discordClient = new DiscordRpcClient({
    clientId: DISCORD_CLIENT_ID,
    transport: "ipc"
  });

  discordClient.on("ready", () => {
    discordReady = true;
    console.log("Discord Rich Presence terhubung.");
  });

  discordClient.on("disconnected", () => {
    discordReady = false;
    console.log("Discord Rich Presence terputus.");
  });

  discordClient.login().catch((err) => {
    discordReady = false;
    console.log("Discord Rich Presence tidak aktif (Discord mungkin belum dibuka):", err.message);
  });
}

function setDiscordPlayingActivity(playerName, serverIp) {
  if (!discordReady || !discordClient || !discordClient.user) {
    return;
  }

  if (!activityStartTimestamp) {
    activityStartTimestamp = Date.now();
  }

  discordClient.user
    .setActivity({
      details: "Bermain di GTA: Pinehill",
      state: "Sebagai " + playerName,
      startTimestamp: activityStartTimestamp,
      largeImageKey: "logo",
      largeImageText: "SAMP Launcher",
      smallImageKey: "logo",
      smallImageText: serverIp,
      instance: false
    })
    .catch((err) => {
      console.error("Gagal mengatur Discord activity:", err.message);
    });
}

function clearDiscordActivity() {
  activityStartTimestamp = null;

  if (!discordReady || !discordClient || !discordClient.user) {
    return;
  }

  discordClient.user.clearActivity().catch((err) => {
    console.error("Gagal menghapus Discord activity:", err.message);
  });
}

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw);
      return {
        gtaSaDirectory: typeof parsed.gtaSaDirectory === "string" ? parsed.gtaSaDirectory : ""
      };
    }
  } catch (err) {
    console.error("Gagal membaca config.json:", err.message);
  }
  return { gtaSaDirectory: "" };
}

function writeConfig(config) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Gagal menyimpan config.json:", err.message);
    return false;
  }
}

const NICKNAME_PATTERN = /^[A-Za-z0-9_\[\]]{3,20}$/;

function setSampPlayerNameRegistry(playerName) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve({ success: true, skipped: true });
      return;
    }

    const regProcess = spawn(
      "reg",
      ["add", "HKCU\\SOFTWARE\\SAMP", "/v", "PlayerName", "/t", "REG_SZ", "/d", playerName, "/f"],
      { windowsHide: true }
    );

    regProcess.on("error", (err) => {
      console.error("Gagal menjalankan reg.exe:", err.message);
      resolve({ success: false, skipped: false });
    });

    regProcess.on("close", (code) => {
      resolve({ success: code === 0, skipped: false });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 550,
    minWidth: 900,
    minHeight: 550,
    maxWidth: 900,
    maxHeight: 550,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    backgroundColor: "#0f1115",
    icon: path.join(__dirname, "assets", "icon.ico"),
    title: "SAMP Launcher",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  initDiscordRpc();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (discordClient) {
    try {
      discordClient.destroy();
    } catch (err) {
      console.error("Gagal menutup koneksi Discord:", err.message);
    }
  }
});

ipcMain.handle("launch-samp", async (event, payload) => {
  const serverIp = payload && payload.serverIp ? String(payload.serverIp) : "";
  const playerName = payload && payload.playerName ? String(payload.playerName).trim() : "";

  if (!playerName) {
    return { success: false, message: "Username tidak boleh kosong" };
  }

  if (!NICKNAME_PATTERN.test(playerName)) {
    return {
      success: false,
      message: "Username hanya boleh huruf, angka, underscore, dan kurung siku [ ], panjang 3-20 karakter"
    };
  }

  const config = readConfig();
  const gtaSaDirectory = config.gtaSaDirectory;

  if (!gtaSaDirectory) {
    return {
      success: false,
      message: "Directory GTA SA belum diatur. Silakan atur lewat menu Setting."
    };
  }

  const executablePath = path.join(gtaSaDirectory, "samp.exe");

  if (!fs.existsSync(executablePath)) {
    return {
      success: false,
      message: "samp.exe tidak ditemukan di directory yang diatur. Periksa kembali di menu Setting."
    };
  }

  const regResult = await setSampPlayerNameRegistry(playerName);
  if (!regResult.success && !regResult.skipped) {
    console.error(
      "Gagal menulis nickname ke registry. samp.exe kemungkinan akan memakai nickname lama dari sesi sebelumnya."
    );
  }

  try {
    const child = spawn(executablePath, [serverIp], {
      cwd: gtaSaDirectory,
      detached: true,
      stdio: "ignore"
    });

    child.on("error", (err) => {
      console.error("Gagal menjalankan samp.exe:", err.message);
    });

    child.on("exit", () => {
      clearDiscordActivity();
    });

    child.unref();

    setDiscordPlayingActivity(playerName, serverIp);

    return {
      success: true,
      message: "Menyambungkan sebagai " + playerName + " ke server..."
    };
  } catch (error) {
    return {
      success: false,
      message: "Gagal menjalankan samp.exe: " + error.message
    };
  }
});

ipcMain.handle("get-settings", async () => {
  return readConfig();
});

ipcMain.handle("save-settings", async (event, payload) => {
  const gtaSaDirectory = payload && payload.gtaSaDirectory ? String(payload.gtaSaDirectory).trim() : "";

  if (!gtaSaDirectory) {
    return { success: false, message: "Directory GTA SA tidak boleh kosong" };
  }

  if (!fs.existsSync(gtaSaDirectory)) {
    return { success: false, message: "Directory yang dipilih tidak ditemukan" };
  }

  const sampExeCheck = path.join(gtaSaDirectory, "samp.exe");
  if (!fs.existsSync(sampExeCheck)) {
    return {
      success: false,
      message: "samp.exe tidak ditemukan di directory tersebut"
    };
  }

  const saved = writeConfig({ gtaSaDirectory });

  if (!saved) {
    return { success: false, message: "Gagal menyimpan pengaturan" };
  }

  return { success: true, message: "Directory GTA SA berhasil disimpan", gtaSaDirectory };
});

ipcMain.handle("select-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Pilih Directory GTA San Andreas",
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, directory: "" };
  }

  return { canceled: false, directory: result.filePaths[0] };
});