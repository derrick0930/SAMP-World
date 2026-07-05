const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const { Client: DiscordRpcClient } = require("@xhayper/discord-rpc");

let mainWindow = null;

const LOG_FILE_NAME = "SAMP-World.txt";
const MAX_LOG_SIZE_BYTES = 2 * 1024 * 1024;

function getLogPath() {
  try {
    const config = readConfig();
    if (config.gtaSaDirectory && fs.existsSync(config.gtaSaDirectory)) {
      return path.join(config.gtaSaDirectory, LOG_FILE_NAME);
    }
  } catch (err) {}
  return path.join(app.getPath("userData"), LOG_FILE_NAME);
}

function writeLog(level, message) {
  try {
    const logPath = getLogPath();
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        fs.writeFileSync(logPath, "", "utf8");
      }
    } else {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const line = "[" + timestamp + "] [" + level + "] " + message + "\n";
    fs.appendFileSync(logPath, line, "utf8");
  } catch (err) {
    console.error("Gagal menulis log ke " + LOG_FILE_NAME + ":", err.message);
  }
  if (level === "ERROR") {
    console.error(message);
  } else {
    console.log(message);
  }
}

const DISCORD_CLIENT_ID = "1522511223940186253";
const DISCORD_LOGO_URL = "https://raw.githubusercontent.com/derrick0930/SAMP-World/refs/heads/main/assets/logo.png";
const DISCORD_ID_PATTERN = /^\d{15,25}$/;

const SERVER_HOST = "208.84.103.75";
const SERVER_PORT = 7012;
const SERVER_STATUS_API =
  "https://samp-api-blue.vercel.app/api/samp-server?host=" + SERVER_HOST + "&port=" + SERVER_PORT;
const DISCORD_ACTIVITY_REFRESH_MS = 5000;

let discordClient = null;
let discordReady = false;
let discordConfigured = false;
let discordLastError = "";
let activityStartTimestamp = null;
let discordRetryTimer = null;

let activeSession = false;
let activityRefreshTimer = null;

async function fetchServerStatusForDiscord() {
  try {
    const response = await fetch(SERVER_STATUS_API);
    if (!response.ok) {
      return null;
    }
    const json = await response.json();
    if (!json || !json.success || !json.data) {
      return null;
    }
    const server = json.data.server || {};
    const players = json.data.players || {};
    return {
      serverName: typeof server.name === "string" ? server.name : "",
      online: typeof players.online === "number" ? players.online : 0,
      max: typeof players.max === "number" ? players.max : 0
    };
  } catch (err) {
    writeLog("ERROR", "Gagal fetch status server untuk Discord Rich Presence: " + err.message);
    return null;
  }
}

function connectDiscordClient(clientId) {
  if (discordClient) {
    try {
      discordClient.destroy();
    } catch (err) {}
  }

  discordClient = new DiscordRpcClient({
    clientId: clientId,
    transport: "ipc"
  });

  discordClient.on("ready", () => {
    discordReady = true;
    discordLastError = "";
    writeLog("INFO", "Discord Rich Presence terhubung.");
  });

  discordClient.on("disconnected", () => {
    discordReady = false;
    writeLog("WARN", "Discord Rich Presence terputus.");
  });

  discordClient.login().catch((err) => {
    discordReady = false;
    discordLastError = err.message;
    writeLog("WARN", "Discord Rich Presence belum terhubung (Discord mungkin belum dibuka): " + err.message);
  });
}

function initDiscordRpc() {
  const trimmedId = (DISCORD_CLIENT_ID || "").trim();
  discordConfigured = DISCORD_ID_PATTERN.test(trimmedId);

  if (!discordConfigured) {
    discordLastError =
      'DISCORD_CLIENT_ID tidak valid. Nilai saat ini: "' +
      trimmedId +
      '". Client ID Discord harus berupa angka 15-25 digit.';
    writeLog("WARN", "Discord Rich Presence dilewati: " + discordLastError);
    return;
  }

  connectDiscordClient(trimmedId);

  if (discordRetryTimer) {
    clearInterval(discordRetryTimer);
  }

  discordRetryTimer = setInterval(() => {
    if (!discordReady && discordConfigured) {
      connectDiscordClient(trimmedId);
    }
  }, 20000);
}

function setDiscordPlayingActivity(serverName, onlinePlayers, maxPlayers) {
  if (!discordReady || !discordClient || !discordClient.user) {
    return;
  }

  if (!activityStartTimestamp) {
    activityStartTimestamp = Date.now();
  }

  const safeServerName = serverName || "GTA: Pinehill";
  const safeOnline = typeof onlinePlayers === "number" && !isNaN(onlinePlayers) ? onlinePlayers : 0;
  const safeMax = typeof maxPlayers === "number" && !isNaN(maxPlayers) ? maxPlayers : 0;

  const activityPayload = {
    details: safeServerName + "[" + safeOnline + "/" + safeMax + "]",
    state: SERVER_HOST + ":" + SERVER_PORT,
    startTimestamp: activityStartTimestamp,
    instance: false
  };

  const trimmedLogoUrl = (DISCORD_LOGO_URL || "").trim();
  if (trimmedLogoUrl.indexOf("https://") === 0) {
    activityPayload.largeImageKey = trimmedLogoUrl;
    activityPayload.largeImageText = "SA:MP World";
    activityPayload.smallImageKey = trimmedLogoUrl;
    activityPayload.smallImageText = "SA:MP World";
  }

  discordClient.user.setActivity(activityPayload).catch((err) => {
    writeLog("ERROR", "Gagal mengatur Discord activity: " + err.message);
  });
}

function startDiscordActivityAutoRefresh() {
  if (activityRefreshTimer) {
    clearInterval(activityRefreshTimer);
  }

  activityRefreshTimer = setInterval(async () => {
    if (!activeSession) {
      clearInterval(activityRefreshTimer);
      activityRefreshTimer = null;
      return;
    }

    const status = await fetchServerStatusForDiscord();
    if (!status) {
      return;
    }

    setDiscordPlayingActivity(status.serverName, status.online, status.max);
  }, DISCORD_ACTIVITY_REFRESH_MS);
}

function stopDiscordActivityAutoRefresh() {
  if (activityRefreshTimer) {
    clearInterval(activityRefreshTimer);
    activityRefreshTimer = null;
  }
}

function clearDiscordActivity() {
  activityStartTimestamp = null;
  activeSession = false;
  stopDiscordActivityAutoRefresh();

  if (!discordReady || !discordClient || !discordClient.user) {
    return;
  }

  discordClient.user.clearActivity().catch((err) => {
    writeLog("ERROR", "Gagal menghapus Discord activity: " + err.message);
  });
}

const GTA_PROCESS_NAME = "gta_sa.exe";
const GTA_MONITOR_GRACE_PERIOD_MS = 20000;
const GTA_MONITOR_POLL_INTERVAL_MS = 8000;
const GTA_MONITOR_MAX_WAIT_MS = 120000;

function isGtaProcessRunning(callback) {
  if (process.platform !== "win32") {
    callback(true);
    return;
  }

  exec('tasklist /FI "IMAGENAME eq ' + GTA_PROCESS_NAME + '" /NH', (err, stdout) => {
    if (err) {
      console.error("Gagal menjalankan tasklist untuk cek proses game:", err.message);
      callback(false);
      return;
    }
    const output = (stdout || "").toLowerCase();
    callback(output.indexOf(GTA_PROCESS_NAME) !== -1);
  });
}

function monitorGtaProcessForDiscord() {
  console.log("Mulai memantau proses " + GTA_PROCESS_NAME + " untuk Discord Rich Presence.");

  setTimeout(() => {
    let hasSeenGtaProcess = false;
    let elapsedWaitingForStartMs = 0;

    const pollTimer = setInterval(() => {
      isGtaProcessRunning((isRunning) => {
        if (isRunning) {
          if (!hasSeenGtaProcess) {
            console.log(GTA_PROCESS_NAME + " terdeteksi berjalan.");
          }
          hasSeenGtaProcess = true;
          return;
        }

        if (hasSeenGtaProcess) {
          console.log(GTA_PROCESS_NAME + " sudah tidak berjalan, menghapus Discord Rich Presence.");
          clearInterval(pollTimer);
          clearDiscordActivity();
          return;
        }

        elapsedWaitingForStartMs += GTA_MONITOR_POLL_INTERVAL_MS;
        if (elapsedWaitingForStartMs >= GTA_MONITOR_MAX_WAIT_MS) {
          console.log(
            GTA_PROCESS_NAME +
              " tidak pernah terdeteksi berjalan dalam " +
              GTA_MONITOR_MAX_WAIT_MS / 1000 +
              " detik. Berhenti memantau."
          );
          clearInterval(pollTimer);
        }
      });
    }, GTA_MONITOR_POLL_INTERVAL_MS);
  }, GTA_MONITOR_GRACE_PERIOD_MS);
}

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw);
      return {
        gtaSaDirectory: typeof parsed.gtaSaDirectory === "string" ? parsed.gtaSaDirectory : "",
        lastUsername: typeof parsed.lastUsername === "string" ? parsed.lastUsername : "",
        theme: parsed.theme === "light" ? "light" : "dark"
      };
    }
  } catch (err) {
    console.error("Gagal membaca config.json:", err.message);
  }
  return { gtaSaDirectory: "", lastUsername: "", theme: "dark" };
}

function writeConfig(partialConfig) {
  try {
    const currentConfig = readConfig();
    const mergedConfig = Object.assign({}, currentConfig, partialConfig);
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2), "utf8");
    return true;
  } catch (err) {
    writeLog("ERROR", "Gagal menyimpan config.json: " + err.message);
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
      writeLog("ERROR", "Gagal menjalankan reg.exe: " + err.message);
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
  writeLog("INFO", "==================== SAMP Launcher dibuka ====================");
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
    writeLog("INFO", "Launcher ditutup.");
    app.quit();
  }
});

app.on("before-quit", () => {
  if (discordClient) {
    try {
      discordClient.destroy();
    } catch (err) {
      writeLog("ERROR", "Gagal menutup koneksi Discord: " + err.message);
    }
  }
});

ipcMain.handle("launch-samp", async (event, payload) => {
  const serverIp = payload && payload.serverIp ? String(payload.serverIp) : "";
  const playerName = payload && payload.playerName ? String(payload.playerName).trim() : "";
  const serverName = payload && payload.serverName ? String(payload.serverName) : "";
  const onlinePlayers = payload && typeof payload.onlinePlayers === "number" ? payload.onlinePlayers : 0;
  const maxPlayers = payload && typeof payload.maxPlayers === "number" ? payload.maxPlayers : 0;

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
    writeLog("WARN", "Percobaan connect gagal: directory GTA SA belum diatur.");
    return {
      success: false,
      message: "Directory GTA SA belum diatur. Silakan atur lewat menu Setting."
    };
  }

  const executablePath = path.join(gtaSaDirectory, "samp.exe");

  if (!fs.existsSync(executablePath)) {
    writeLog("ERROR", "samp.exe tidak ditemukan di: " + executablePath);
    return {
      success: false,
      message: "samp.exe tidak ditemukan di directory yang diatur. Periksa kembali di menu Setting."
    };
  }

  const regResult = await setSampPlayerNameRegistry(playerName);
  if (!regResult.success && !regResult.skipped) {
    writeLog(
      "WARN",
      "Gagal menulis nickname ke registry. samp.exe kemungkinan akan memakai nickname lama dari sesi sebelumnya."
    );
  }

  writeConfig({ lastUsername: playerName });

  try {
    const child = spawn(executablePath, [serverIp], {
      cwd: gtaSaDirectory,
      detached: true,
      stdio: "ignore"
    });

    child.on("error", (err) => {
      writeLog("ERROR", "Gagal menjalankan samp.exe: " + err.message);
    });

    child.unref();

    writeLog(
      "INFO",
      "samp.exe dijalankan (PID " + child.pid + ") untuk connect ke " + serverIp + " sebagai " + playerName + "."
    );

    activeSession = true;
    setDiscordPlayingActivity(serverName, onlinePlayers, maxPlayers);
    startDiscordActivityAutoRefresh();
    monitorGtaProcessForDiscord();

    return {
      success: true,
      message: "Menyambungkan sebagai " + playerName + " ke server..."
    };
  } catch (error) {
    writeLog("ERROR", "Exception saat menjalankan samp.exe: " + error.message);
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

  writeLog("INFO", "Directory GTA SA disimpan: " + gtaSaDirectory);

  return { success: true, message: "Directory GTA SA berhasil disimpan", gtaSaDirectory };
});

ipcMain.handle("get-discord-status", async () => {
  return {
    configured: discordConfigured,
    ready: discordReady,
    lastError: discordLastError
  };
});

ipcMain.handle("save-theme", async (event, payload) => {
  const theme = payload && payload.theme === "light" ? "light" : "dark";
  writeConfig({ theme: theme });
  return { success: true, theme: theme };
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