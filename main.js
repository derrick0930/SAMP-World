const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const { Client: DiscordRpcClient } = require("@xhayper/discord-rpc");

app.setName("SAMP World");

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

const SERVERS_PATH = path.join(app.getPath("userData"), "servers.json");

function readServers() {
  try {
    if (fs.existsSync(SERVERS_PATH)) {
      const raw = fs.readFileSync(SERVERS_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) => item && typeof item.host === "string" && typeof item.port === "number"
        );
      }
    }
  } catch (err) {
    console.error("Gagal membaca servers.json:", err.message);
  }
  return [];
}

function writeServers(servers) {
  try {
    fs.mkdirSync(path.dirname(SERVERS_PATH), { recursive: true });
    fs.writeFileSync(SERVERS_PATH, JSON.stringify(servers, null, 2), "utf8");
    return true;
  } catch (err) {
    writeLog("ERROR", "Gagal menyimpan servers.json: " + err.message);
    return false;
  }
}
const dgram = require("dgram");

function decodeSampString(buffer) {
  return buffer.toString("latin1");
}

function sendSampQuery(host, port, opcode, timeoutMs) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const hostParts = host.split(".");
    const packet = Buffer.alloc(11);

    packet.write("SAMP", 0, "ascii");
    for (let i = 0; i < 4; i++) {
      packet[4 + i] = parseInt(hostParts[i], 10) || 0;
    }
    packet[8] = port & 0xff;
    packet[9] = (port >> 8) & 0xff;
    packet[10] = opcode.charCodeAt(0);

    const sentAt = Date.now();
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch (err) {}
      resolve(result);
    }

    const timer = setTimeout(() => finish(null), timeoutMs || 1500);

    socket.on("message", (message) => {
      const ping = Date.now() - sentAt;

      if (message.length < 11) {
        finish(null);
        return;
      }

      finish({ body: message.slice(11), ping: ping });
    });

    socket.on("error", () => finish(null));

    try {
      socket.send(packet, 0, packet.length, port, host, (err) => {
        if (err) {
          finish(null);
        }
      });
    } catch (err) {
      finish(null);
    }
  });
}

async function queryServerInfo(host, port) {
  const result = await sendSampQuery(host, port, "i");
  if (!result) {
    return null;
  }

  try {
    const body = result.body;
    let offset = 0;

    const passworded = body.readUInt8(offset);
    offset += 1;

    const online = body.readUInt16LE(offset);
    offset += 2;

    const maxplayers = body.readUInt16LE(offset);
    offset += 2;

    let strlen = body.readUInt32LE(offset);
    offset += 4;
    const hostname = decodeSampString(body.slice(offset, offset + strlen));
    offset += strlen;

    strlen = body.readUInt32LE(offset);
    offset += 4;
    const gamemode = decodeSampString(body.slice(offset, offset + strlen));
    offset += strlen;

    strlen = body.readUInt32LE(offset);
    offset += 4;
    const mapname = decodeSampString(body.slice(offset, offset + strlen));
    offset += strlen;

    return {
      hostname: hostname,
      gamemode: gamemode,
      mapname: mapname,
      passworded: passworded === 1,
      maxplayers: maxplayers,
      online: online,
      ping: result.ping
    };
  } catch (err) {
    return null;
  }
}

async function queryServerRules(host, port) {
  const result = await sendSampQuery(host, port, "r");
  if (!result) {
    return null;
  }

  try {
    const body = result.body;
    let offset = 0;

    let ruleCount = body.readUInt16LE(offset);
    offset += 2;

    const rules = {};

    while (ruleCount > 0) {
      let strlen = body.readUInt8(offset);
      offset += 1;
      const property = decodeSampString(body.slice(offset, offset + strlen));
      offset += strlen;

      strlen = body.readUInt8(offset);
      offset += 1;
      const value = decodeSampString(body.slice(offset, offset + strlen));
      offset += strlen;

      rules[property] = value;
      ruleCount -= 1;
    }

    return rules;
  } catch (err) {
    return null;
  }
}

async function fetchServerStatus(host, port) {
  const info = await queryServerInfo(host, port);

  if (!info) {
    return { connected: false };
  }

  const rules = await queryServerRules(host, port);

  return {
    connected: true,
    serverName: info.hostname || "",
    gamemode: info.gamemode || "",
    version: rules && typeof rules.version === "string" ? rules.version : "",
    online: info.online,
    max: info.maxplayers,
    ping: info.ping
  };
}

const DISCORD_CLIENT_ID = "1522511223940186253";
const DISCORD_SERVER_URL = "https://discord.gg/b5wrXeehTm";
const DISCORD_DOWNLOAD_URL = "https://github.com/derrick0930/SAMP-World/releases";
const DISCORD_LOGO_URL = "https://raw.githubusercontent.com/derrick0930/SAMP-World/refs/heads/main/assets/logo.png";
const DISCORD_LOGO_SMALL = "https://i.imgur.com/NWUGCLE.png";
const DISCORD_ID_PATTERN = /^\d{15,25}$/;

const DISCORD_ACTIVITY_REFRESH_MS = 5000;

let discordClient = null;
let discordReady = false;
let discordConfigured = false;
let discordLastError = "";
let activityStartTimestamp = null;
let discordRetryTimer = null;

let activeSession = null; // { host, port }
let activityRefreshTimer = null;

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

function setDiscordPlayingActivity(host, port, serverName, onlinePlayers, maxPlayers) {
  if (!discordReady || !discordClient || !discordClient.user) {
    return;
  }

  if (!activityStartTimestamp) {
    activityStartTimestamp = Date.now();
  }

  const safeServerName = serverName || host + ":" + port;
  const safeOnline = typeof onlinePlayers === "number" && !isNaN(onlinePlayers) ? onlinePlayers : 0;
  const safeMax = typeof maxPlayers === "number" && !isNaN(maxPlayers) ? maxPlayers : 0;

  const activityPayload = {
    details: safeServerName,
    state: host + ":" + port,
    startTimestamp: activityStartTimestamp,
    instance: false
  };

  const trimmedLogoUrl = (DISCORD_LOGO_URL || "").trim();
  const trimmedLogoSmall = (DISCORD_LOGO_SMALL || "").trim();
  if (trimmedLogoUrl.indexOf("https://") === 0) {
    activityPayload.largeImageKey = trimmedLogoUrl;
    activityPayload.largeImageText = "SA:MP World";
    activityPayload.smallImageKey = trimmedLogoSmall;
    activityPayload.smallImageText = safeOnline + "/" + safeMax + " Players";
  }

  const buttons = [];
  const trimmedServerUrl = (DISCORD_SERVER_URL || "").trim();
  const trimmedDownloadUrl = (DISCORD_DOWNLOAD_URL || "").trim();

  if (trimmedServerUrl.indexOf("https://") === 0) {
    buttons.push({ label: "Join Server", url: trimmedServerUrl });
  }
  if (trimmedDownloadUrl.indexOf("https://") === 0) {
    buttons.push({ label: "Download Launcher", url: trimmedDownloadUrl });
  }
  if (buttons.length > 0) {
    activityPayload.buttons = buttons;
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

    const status = await fetchServerStatus(activeSession.host, activeSession.port);
    if (!status) {
      return;
    }

    setDiscordPlayingActivity(activeSession.host, activeSession.port, status.serverName, status.online, status.max);
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
  activeSession = null;
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
    title: "SA:MP World",
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
  writeLog("INFO", "==================== SA:MP World dibuka ====================");
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

ipcMain.handle("get-servers", async () => {
  return readServers();
});

ipcMain.handle("add-server", async (event, payload) => {
  const host = payload && payload.host ? String(payload.host).trim() : "";
  const port = payload && payload.port ? parseInt(payload.port, 10) : NaN;

  if (!host) {
    return { success: false, message: "IP/Host tidak boleh kosong" };
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { success: false, message: "Port tidak valid" };
  }

  const servers = readServers();
  const alreadyExists = servers.some((item) => item.host === host && item.port === port);
  if (alreadyExists) {
    return { success: false, message: "Server ini sudah ada di daftar" };
  }

  const status = await fetchServerStatus(host, port);
  if (!status || !status.connected) {
    return {
      success: false,
      message: "Server tidak dapat dihubungi. Periksa kembali IP dan Port-nya."
    };
  }

  servers.push({ host: host, port: port });
  const saved = writeServers(servers);

  if (!saved) {
    return { success: false, message: "Gagal menyimpan server" };
  }

  writeLog("INFO", "Server ditambahkan ke daftar: " + host + ":" + port);

  return { success: true, servers: servers };
});

ipcMain.handle("remove-server", async (event, payload) => {
  const host = payload && payload.host ? String(payload.host).trim() : "";
  const port = payload && payload.port ? parseInt(payload.port, 10) : NaN;

  let servers = readServers();
  servers = servers.filter((item) => !(item.host === host && item.port === port));
  writeServers(servers);

  writeLog("INFO", "Server dihapus dari daftar: " + host + ":" + port);

  return { success: true, servers: servers };
});

ipcMain.handle("get-server-status", async (event, payload) => {
  const host = payload && payload.host ? String(payload.host).trim() : "";
  const port = payload && payload.port ? parseInt(payload.port, 10) : NaN;

  if (!host || !Number.isInteger(port)) {
    return null;
  }

  return fetchServerStatus(host, port);
});

ipcMain.handle("launch-samp", async (event, payload) => {
  const host = payload && payload.host ? String(payload.host).trim() : "";
  const port = payload && payload.port ? parseInt(payload.port, 10) : NaN;
  const playerName = payload && payload.playerName ? String(payload.playerName).trim() : "";
  const serverName = payload && payload.serverName ? String(payload.serverName) : "";
  const onlinePlayers = payload && typeof payload.onlinePlayers === "number" ? payload.onlinePlayers : 0;
  const maxPlayers = payload && typeof payload.maxPlayers === "number" ? payload.maxPlayers : 0;

  if (!host || !Number.isInteger(port)) {
    return { success: false, message: "Server tujuan tidak valid" };
  }

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
    const child = spawn(executablePath, [host + ":" + port], {
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
      "samp.exe dijalankan (PID " + child.pid + ") untuk connect ke " + host + ":" + port + " sebagai " + playerName + "."
    );

    activeSession = { host: host, port: port };
    setDiscordPlayingActivity(host, port, serverName, onlinePlayers, maxPlayers);
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

ipcMain.handle("open-discord-server", async () => {
  const url = (DISCORD_SERVER_URL || "").trim();

  if (url.indexOf("https://") !== 0) {
    return { success: false, message: "Link Discord server belum diatur di main.js" };
  }

  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    writeLog("ERROR", "Gagal membuka link Discord server: " + err.message);
    return { success: false, message: "Gagal membuka Discord: " + err.message };
  }
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