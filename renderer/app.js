(function () {
  "use strict";

  const STATUS_REFRESH_INTERVAL_MS = 15000;
  const NICKNAME_PATTERN = /^[A-Za-z0-9_\[\]]{3,20}$/;

  const modalOverlay = document.getElementById("modal-overlay");
  const cancelBtn = document.getElementById("cancel-btn");
  const connectBtn = document.getElementById("connect-btn");
  const usernameInput = document.getElementById("username-input");
  const errorMessage = document.getElementById("error-message");
  const modalServerIpEl = document.getElementById("modal-server-ip");
  const toast = document.getElementById("toast");

  const settingsBtn = document.getElementById("settings-btn");
  const settingsModalOverlay = document.getElementById("settings-modal-overlay");
  const settingsCancelBtn = document.getElementById("settings-cancel-btn");
  const settingsSaveBtn = document.getElementById("settings-save-btn");
  const browseBtn = document.getElementById("browse-btn");
  const directoryInput = document.getElementById("directory-input");
  const settingsErrorMessage = document.getElementById("settings-error-message");
  const discordServerBtn = document.getElementById("discord-server-btn");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeToggleIcon = document.getElementById("theme-toggle-icon");

  const addServerBtn = document.getElementById("add-server-btn");
  const addServerModalOverlay = document.getElementById("add-server-modal-overlay");
  const addServerCancelBtn = document.getElementById("add-server-cancel-btn");
  const addServerConfirmBtn = document.getElementById("add-server-confirm-btn");
  const addServerIpInput = document.getElementById("add-server-ip-input");
  const addServerPortInput = document.getElementById("add-server-port-input");
  const addServerErrorMessage = document.getElementById("add-server-error-message");

  const serversTableBody = document.getElementById("servers-table-body");
  const serversEmptyState = document.getElementById("servers-empty-state");

  let toastTimeout = null;
  let savedServers = [];
  let statusCache = {};
  let selectedServer = null;

  function serverKey(host, port) {
    return host + ":" + port;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  async function loadServers() {
    try {
      savedServers = await window.sampLauncher.getServers();
    } catch (err) {
      savedServers = [];
    }
    renderServersTable();
    refreshAllServerStatuses();
  }

  async function fetchAndCacheServerStatus(host, port) {
    const key = serverKey(host, port);
    try {
      const status = await window.sampLauncher.getServerStatus(host, port);

      if (status && status.connected) {
        statusCache[key] = {
          online: true,
          name: status.serverName || key,
          gamemode: status.gamemode || "-",
          version: status.version || "-",
          onlineCount: typeof status.online === "number" ? status.online : 0,
          maxCount: typeof status.max === "number" ? status.max : 0,
          ping: typeof status.ping === "number" ? status.ping : null
        };
      } else {
        statusCache[key] = { online: false, name: key };
      }
    } catch (err) {
      statusCache[key] = { online: false, name: key };
    }
  }

  async function refreshAllServerStatuses() {
    await Promise.all(savedServers.map((srv) => fetchAndCacheServerStatus(srv.host, srv.port)));
    renderServersTable();
  }

  function renderServersTable() {
    serversTableBody.innerHTML = "";

    if (savedServers.length === 0) {
      serversEmptyState.style.display = "block";
      return;
    }
    serversEmptyState.style.display = "none";

    savedServers.forEach((srv) => {
      const key = serverKey(srv.host, srv.port);
      const status = statusCache[key] || { online: false, name: key };

      const tr = document.createElement("tr");
      tr.className = "server-row" + (status.online ? "" : " server-row--offline");

      const playersText = status.online ? status.onlineCount + " / " + status.maxCount : "-";
      const pingText = status.online && status.ping !== null ? status.ping + " ms" : "-";

      tr.innerHTML =
        "<td>" + escapeHtml(status.name) + "</td>" +
        "<td>" + escapeHtml(status.online ? status.version : "-") + "</td>" +
        "<td>" + escapeHtml(status.online ? status.gamemode : "-") + "</td>" +
        "<td class=\"servers-table__players\">" + escapeHtml(playersText) + "</td>" +
        "<td class=\"servers-table__ping\">" + escapeHtml(pingText) + "</td>" +
        "<td><button class=\"remove-server-btn\" type=\"button\" title=\"Hapus Server\">&times;</button></td>";

      tr.addEventListener("click", (event) => {
        if (event.target.closest(".remove-server-btn")) {
          return;
        }
        openConnectModalFor(srv.host, srv.port, status);
      });

      const removeBtn = tr.querySelector(".remove-server-btn");
      removeBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await window.sampLauncher.removeServer(srv.host, srv.port);
          showToast("Server dihapus dari daftar", "success");
          await loadServers();
        } catch (err) {
          showToast("Gagal menghapus server: " + err.message, "error");
        }
      });

      serversTableBody.appendChild(tr);
    });
  }

  function showAddServerError(message) {
    addServerErrorMessage.textContent = message;
    addServerErrorMessage.classList.add("show");
  }

  function clearAddServerError() {
    addServerErrorMessage.textContent = "";
    addServerErrorMessage.classList.remove("show");
  }

  function openAddServerModal() {
    addServerIpInput.value = "";
    addServerPortInput.value = "";
    clearAddServerError();
    addServerModalOverlay.classList.add("active");
    setTimeout(() => addServerIpInput.focus(), 150);
  }

  function closeAddServerModal() {
    addServerModalOverlay.classList.remove("active");
    clearAddServerError();
  }

  async function handleAddServer() {
    const host = addServerIpInput.value.trim();
    const portRaw = addServerPortInput.value.trim();
    const port = Number(portRaw);

    if (!host) {
      showAddServerError("IP/Host tidak boleh kosong");
      return;
    }

    if (!/^\d+$/.test(portRaw) || port <= 0 || port > 65535) {
      showAddServerError("Port tidak valid");
      return;
    }

    clearAddServerError();
    addServerConfirmBtn.disabled = true;
    addServerConfirmBtn.textContent = "Mengecek...";

    try {
      const result = await window.sampLauncher.addServer(host, port);

      if (result && result.success) {
        showToast("Server berhasil ditambahkan", "success");
        closeAddServerModal();
        await loadServers();
      } else {
        showAddServerError(result && result.message ? result.message : "Gagal menambahkan server");
      }
    } catch (err) {
      showAddServerError("Terjadi kesalahan: " + err.message);
    } finally {
      addServerConfirmBtn.disabled = false;
      addServerConfirmBtn.textContent = "Add";
    }
  }

  function openConnectModalFor(host, port, status) {
    selectedServer = { host: host, port: port, status: status };
    modalServerIpEl.textContent = host + ":" + port;
    openModal();
  }

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
      // gagal load username terakhir bukan hal fatal
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

  function showSettingsError(message) {
    settingsErrorMessage.textContent = message;
    settingsErrorMessage.classList.add("show");
  }

  function clearSettingsError() {
    settingsErrorMessage.textContent = "";
    settingsErrorMessage.classList.remove("show");
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
    if (!selectedServer) {
      showError("Pilih server dari daftar terlebih dahulu");
      return;
    }

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

    const status = selectedServer.status || {};

    try {
      const result = await window.sampLauncher.launchSamp(selectedServer.host, selectedServer.port, playerName, {
        serverName: status.name,
        onlinePlayers: status.onlineCount,
        maxPlayers: status.maxCount
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

  cancelBtn.addEventListener("click", closeModal);
  connectBtn.addEventListener("click", handleConnect);

  settingsBtn.addEventListener("click", openSettingsModal);
  settingsCancelBtn.addEventListener("click", closeSettingsModal);
  browseBtn.addEventListener("click", handleBrowseDirectory);
  settingsSaveBtn.addEventListener("click", handleSaveSettings);

  addServerBtn.addEventListener("click", openAddServerModal);
  addServerCancelBtn.addEventListener("click", closeAddServerModal);
  addServerConfirmBtn.addEventListener("click", handleAddServer);

  addServerIpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddServer();
    }
  });

  addServerPortInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddServer();
    }
  });

  addServerModalOverlay.addEventListener("click", (event) => {
    if (event.target === addServerModalOverlay) {
      closeAddServerModal();
    }
  });

  discordServerBtn.addEventListener("click", async () => {
    try {
      const result = await window.sampLauncher.openDiscordServer();
      if (!result || !result.success) {
        showToast(result && result.message ? result.message : "Gagal membuka Discord", "error");
      }
    } catch (err) {
      showToast("Gagal membuka Discord: " + err.message, "error");
    }
  });

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
    if (addServerModalOverlay.classList.contains("active")) {
      closeAddServerModal();
    }
  });

  themeToggleBtn.addEventListener("click", toggleTheme);

  initTheme();
  loadServers();
  setInterval(refreshAllServerStatuses, STATUS_REFRESH_INTERVAL_MS);
})();