(function () {
  "use strict";

  const SERVER_HOST = "208.84.103.75";
  const SERVER_PORT = 7012;
  const SERVER_IP = SERVER_HOST + ":" + SERVER_PORT;
  const SERVER_STATUS_API =
    "https://samp-api-blue.vercel.app/api/samp-server?host=" +
    SERVER_HOST +
    "&port=" +
    SERVER_PORT;
  const STATUS_REFRESH_INTERVAL_MS = 15000;
  const NICKNAME_PATTERN = /^[A-Za-z0-9_\[\]]{3,20}$/;

  const playBtn = document.getElementById("play-btn");
  const modalOverlay = document.getElementById("modal-overlay");
  const cancelBtn = document.getElementById("cancel-btn");
  const connectBtn = document.getElementById("connect-btn");
  const usernameInput = document.getElementById("username-input");
  const errorMessage = document.getElementById("error-message");
  const toast = document.getElementById("toast");

  const settingsBtn = document.getElementById("settings-btn");
  const settingsModalOverlay = document.getElementById("settings-modal-overlay");
  const settingsCancelBtn = document.getElementById("settings-cancel-btn");
  const settingsSaveBtn = document.getElementById("settings-save-btn");
  const browseBtn = document.getElementById("browse-btn");
  const directoryInput = document.getElementById("directory-input");
  const settingsErrorMessage = document.getElementById("settings-error-message");
  const discordStatusDot = document.getElementById("discord-status-dot");
  const discordStatusText = document.getElementById("discord-status-text");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeToggleIcon = document.getElementById("theme-toggle-icon");

  const serverNameEl = document.getElementById("server-name");
  const statusDotEl = document.getElementById("status-dot");
  const statusTextEl = document.getElementById("status-text");
  const playerCountEl = document.getElementById("player-count");

  let toastTimeout = null;
  let lastServerName = "GTA: Pinehill";
  let lastOnlinePlayers = 0;
  let lastMaxPlayers = 0;

  async function openModal() {
    clearError();
    modalOverlay.classList.add("active");

    usernameInput.value = "";
    try {
      const settings = await window.sampLauncher.getSettings();
      if (settings && settings.lastUsername) {
        usernameInput.value = settings.lastUsername;
      }
    } catch (err) {
      // gagal load username terakhir bukan hal fatal, biarkan input kosong
    }

    setTimeout(() => {
      usernameInput.focus();
      usernameInput.select();
    }, 150);
  }

  function closeModal() {
    modalOverlay.classList.remove("active");
    clearError();
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add("show");
    usernameInput.classList.add("input-error");
  }

  function clearError() {
    errorMessage.textContent = "";
    errorMessage.classList.remove("show");
    usernameInput.classList.remove("input-error");
  }

  function setOnlineState(serverName, online, max) {
    statusDotEl.classList.remove("offline");
    statusTextEl.classList.remove("offline");
    statusTextEl.textContent = "Online";
    if (serverName) {
      serverNameEl.textContent = serverName;
      lastServerName = serverName;
    }
    lastOnlinePlayers = online;
    lastMaxPlayers = max;
    playerCountEl.textContent = online + " / " + max;
  }

  function setOfflineState(message) {
    statusDotEl.classList.add("offline");
    statusTextEl.classList.add("offline");
    statusTextEl.textContent = "Offline";
    playerCountEl.textContent = "- / -";
    if (message) {
      console.error(message);
    }
  }

  async function refreshServerStatus() {
    try {
      const response = await fetch(SERVER_STATUS_API);

      if (!response.ok) {
        setOfflineState("Response API tidak OK: " + response.status);
        return;
      }

      const json = await response.json();

      if (
        json &&
        json.success &&
        json.data &&
        json.data.connection &&
        json.data.connection.status === "connected"
      ) {
        const serverName = json.data.server ? json.data.server.name : "";
        const online = json.data.players ? json.data.players.online : 0;
        const max = json.data.players ? json.data.players.max : 0;
        setOnlineState(serverName, online, max);
      } else {
        setOfflineState("Server tidak terhubung");
      }
    } catch (err) {
      setOfflineState("Gagal mengambil status server: " + err.message);
    }
  }

  function showSettingsError(message) {
    settingsErrorMessage.textContent = message;
    settingsErrorMessage.classList.add("show");
  }

  function clearSettingsError() {
    settingsErrorMessage.textContent = "";
    settingsErrorMessage.classList.remove("show");
  }

  async function refreshDiscordStatus() {
    discordStatusDot.className = "discord-status-dot";
    discordStatusText.textContent = "Mengecek status Discord...";

    try {
      const status = await window.sampLauncher.getDiscordStatus();

      if (!status.configured) {
        discordStatusDot.classList.add("offline");
        discordStatusText.textContent =
          "Discord Rich Presence belum dikonfigurasi (DISCORD_CLIENT_ID di main.js belum diisi dengan Application ID yang valid).";
        return;
      }

      if (status.ready) {
        discordStatusDot.classList.add("online");
        discordStatusText.textContent = "Discord Rich Presence terhubung dan siap dipakai.";
      } else {
        discordStatusDot.classList.add("offline");
        discordStatusText.textContent =
          "Discord Rich Presence belum terhubung. Pastikan aplikasi Discord desktop sedang berjalan." +
          (status.lastError ? " (" + status.lastError + ")" : "");
      }
    } catch (err) {
      discordStatusDot.classList.add("offline");
      discordStatusText.textContent = "Gagal mengecek status Discord: " + err.message;
    }
  }

  async function openSettingsModal() {
    clearSettingsError();
    settingsModalOverlay.classList.add("active");

    try {
      const settings = await window.sampLauncher.getSettings();
      directoryInput.value = settings && settings.gtaSaDirectory ? settings.gtaSaDirectory : "";
    } catch (err) {
      showSettingsError("Gagal memuat pengaturan: " + err.message);
    }

    refreshDiscordStatus();
  }

  function closeSettingsModal() {
    settingsModalOverlay.classList.remove("active");
    clearSettingsError();
  }

  async function handleBrowseDirectory() {
    try {
      const result = await window.sampLauncher.selectDirectory();
      if (!result.canceled && result.directory) {
        directoryInput.value = result.directory;
        clearSettingsError();
      }
    } catch (err) {
      showSettingsError("Gagal membuka dialog folder: " + err.message);
    }
  }

  async function handleSaveSettings() {
    const gtaSaDirectory = directoryInput.value.trim();

    if (!gtaSaDirectory) {
      showSettingsError("Directory GTA SA belum dipilih");
      return;
    }

    clearSettingsError();
    settingsSaveBtn.disabled = true;
    settingsSaveBtn.textContent = "Menyimpan...";

    try {
      const result = await window.sampLauncher.saveSettings(gtaSaDirectory);

      if (result && result.success) {
        showToast(result.message || "Directory GTA SA berhasil disimpan", "success");
        closeSettingsModal();
      } else {
        showSettingsError(result && result.message ? result.message : "Gagal menyimpan pengaturan");
      }
    } catch (err) {
      showSettingsError("Terjadi kesalahan: " + err.message);
    } finally {
      settingsSaveBtn.disabled = false;
      settingsSaveBtn.textContent = "Save";
    }
  }

  const MOON_ICON_PATH =
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  const SUN_ICON_PATH =
    '<circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.55 1.55M18.25 18.25l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.55-1.55M18.25 5.75l1.55-1.55" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("theme-light");
      themeToggleIcon.innerHTML = SUN_ICON_PATH;
      themeToggleBtn.title = "Ganti ke Mode Gelap";
    } else {
      document.body.classList.remove("theme-light");
      themeToggleIcon.innerHTML = MOON_ICON_PATH;
      themeToggleBtn.title = "Ganti ke Mode Terang";
    }
  }

  async function toggleTheme() {
    const nextTheme = document.body.classList.contains("theme-light") ? "dark" : "light";
    applyTheme(nextTheme);
    try {
      await window.sampLauncher.saveTheme(nextTheme);
    } catch (err) {
      // gagal simpan preferensi tema bukan hal fatal
    }
  }

  async function initTheme() {
    try {
      const settings = await window.sampLauncher.getSettings();
      applyTheme(settings && settings.theme === "light" ? "light" : "dark");
    } catch (err) {
      applyTheme("dark");
    }
  }

  function showToast(message, type) {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    toast.textContent = message;
    toast.className = "toast show " + (type || "");
    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 3200);
  }

  async function handleConnect() {
    const playerName = usernameInput.value.trim();

    if (!playerName) {
      showError("Username tidak boleh kosong");
      return;
    }

    if (!NICKNAME_PATTERN.test(playerName)) {
      showError("Username hanya boleh huruf, angka, underscore, dan [ ], 3-20 karakter");
      return;
    }

    clearError();
    connectBtn.disabled = true;
    connectBtn.textContent = "Menghubungkan...";

    try {
      const result = await window.sampLauncher.launchSamp(SERVER_IP, playerName, {
        serverName: lastServerName,
        onlinePlayers: lastOnlinePlayers,
        maxPlayers: lastMaxPlayers
      });

      if (result && result.success) {
        showToast(result.message || "SA-MP sedang dijalankan...", "success");
        closeModal();
      } else {
        showError(result && result.message ? result.message : "Gagal menjalankan SA-MP");
      }
    } catch (err) {
      showError("Terjadi kesalahan: " + err.message);
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect";
    }
  }

  playBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);
  connectBtn.addEventListener("click", handleConnect);

  settingsBtn.addEventListener("click", openSettingsModal);
  settingsCancelBtn.addEventListener("click", closeSettingsModal);
  browseBtn.addEventListener("click", handleBrowseDirectory);
  settingsSaveBtn.addEventListener("click", handleSaveSettings);

  settingsModalOverlay.addEventListener("click", (event) => {
    if (event.target === settingsModalOverlay) {
      closeSettingsModal();
    }
  });

  usernameInput.addEventListener("input", () => {
    if (usernameInput.value.trim()) {
      clearError();
    }
  });

  usernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleConnect();
    }
  });

  modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (modalOverlay.classList.contains("active")) {
      closeModal();
    }
    if (settingsModalOverlay.classList.contains("active")) {
      closeSettingsModal();
    }
  });

  themeToggleBtn.addEventListener("click", toggleTheme);

  initTheme();
  refreshServerStatus();
  setInterval(refreshServerStatus, STATUS_REFRESH_INTERVAL_MS);
})();