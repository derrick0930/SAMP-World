(function () {
  "use strict";

  const STATUS_REFRESH_INTERVAL_MS = 15000;
  const NICKNAME_PATTERN = /^[A-Za-z0-9_\[\]]{3,20}$/;

  const modalOverlay = document.getElementById("modal-overlay");
  const cancelBtn = document.getElementById("cancel-btn");
  const connectBtn = document.getElementById("connect-btn");
  const usernameInput = document.getElementById("username-input");
  const sampVersionSelect = document.getElementById("samp-version-select");
  const errorMessage = document.getElementById("error-message");
  const modalServerIpEl = document.getElementById("modal-server-ip");
  const toast = document.getElementById("toast");

  const passwordModalOverlay = document.getElementById("password-modal-overlay");
  const passwordCancelBtn = document.getElementById("password-cancel-btn");
  const passwordConnectBtn = document.getElementById("password-connect-btn");
  const serverPasswordInput = document.getElementById("server-password-input");
  const passwordErrorMessage = document.getElementById("password-error-message");
  const passwordModalServerIpEl = document.getElementById("password-modal-server-ip");


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
  const sortableHeaders = document.querySelectorAll(".sortable-th");
  const serversTabButtons = document.querySelectorAll(".servers-tab-btn");

  const RECOMMENDED_SERVERS = [{ host: "51.254.139.153", port: 7777 }];

  let toastTimeout = null;
  let savedServers = [];
  let statusCache = {};
  let selectedServer = null;
  let pendingPlayerName = "";
  let pendingSampVersion = "";
  let currentSortKey = null;
  let currentSortDirection = "asc";
  let currentTab = "favorite";

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

  function buildOfflineStatus(key, previous) {
    if (previous) {
      return Object.assign({}, previous, { online: false });
    }
    return {
      online: false,
      name: key,
      gamemode: "-",
      version: "-",
      onlineCount: 0,
      maxCount: 0,
      ping: null,
      locked: null
    };
  }

  async function fetchAndCacheServerStatus(host, port) {
    const key = serverKey(host, port);
    const previous = statusCache[key];

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
          ping: typeof status.ping === "number" ? status.ping : null,
          locked: typeof status.passworded === "boolean" ? status.passworded : false
        };
      } else {
        statusCache[key] = buildOfflineStatus(key, previous);
      }
    } catch (err) {
      statusCache[key] = buildOfflineStatus(key, previous);
    }
  }

  async function refreshAllServerStatuses() {
    const combinedServers = savedServers.concat(RECOMMENDED_SERVERS);
    await Promise.all(combinedServers.map((srv) => fetchAndCacheServerStatus(srv.host, srv.port)));
    renderServersTable();
  }

  function getActiveServerList() {
    return currentTab === "recommended" ? RECOMMENDED_SERVERS : savedServers;
  }

  function getSortedServers() {
    const list = getActiveServerList().slice();

    function statusOf(srv) {
      return (
        statusCache[serverKey(srv.host, srv.port)] || {
          onlineCount: 0,
          ping: null,
          name: serverKey(srv.host, srv.port),
          version: "-",
          gamemode: "-",
          locked: null
        }
      );
    }

    if (!currentSortKey) {
      return list;
    }

    const dir = currentSortDirection === "asc" ? 1 : -1;

    list.sort((a, b) => {
      const sa = statusOf(a);
      const sb = statusOf(b);

      if (currentSortKey === "players") {
        return (sa.onlineCount - sb.onlineCount) * dir;
      }

      if (currentSortKey === "ping") {
        const pa = sa.ping;
        const pb = sb.ping;
        if (pa === null || pa === undefined) return 1;
        if (pb === null || pb === undefined) return -1;
        return (pa - pb) * dir;
      }

      if (currentSortKey === "locked") {
        const la = sa.locked === true ? 1 : 0;
        const lb = sb.locked === true ? 1 : 0;
        return (la - lb) * dir;
      }

      const va = String(sa[currentSortKey] || "").toLowerCase();
      const vb = String(sb[currentSortKey] || "").toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });


    return list;
  }

  function renderServersTable() {
    serversTableBody.innerHTML = "";

    if (getActiveServerList().length === 0) {
      serversEmptyState.style.display = "block";
      serversEmptyState.innerHTML =
        currentTab === "recommended"
          ? "Belum ada server rekomendasi."
          : 'Belum ada server ditambahkan.<br />Klik ikon "+" di pojok kanan atas untuk menambahkan server.';
      return;
    }
    serversEmptyState.style.display = "none";

    const isFavoriteTab = currentTab === "favorite";

    getSortedServers().forEach((srv) => {
      const key = serverKey(srv.host, srv.port);
      const status = statusCache[key] || buildOfflineStatus(key, null);

      const tr = document.createElement("tr");
      tr.className = "server-row" + (status.online ? "" : " server-row--offline");

      const playersText = status.onlineCount + " / " + status.maxCount;
      const pingText = status.ping !== null && status.ping !== undefined ? status.ping + " ms" : "-";
      const offlineBadge = status.online ? "" : '<span class="offline-badge">Offline</span>';

      let lockIconHtml =
        '<span class="lock-icon lock-icon--unknown" title="Status password tidak diketahui">' +
        LOCK_ICON_UNKNOWN_SVG +
        "</span>";
      if (status.locked === true) {
        lockIconHtml =
          '<span class="lock-icon lock-icon--locked" title="Server terkunci (perlu password)">' +
          LOCK_ICON_LOCKED_SVG +
          "</span>";
      } else if (status.locked === false) {
        lockIconHtml =
          '<span class="lock-icon lock-icon--unlocked" title="Server terbuka (tanpa password)">' +
          LOCK_ICON_UNLOCKED_SVG +
          "</span>";
      }

      const actionCellHtml = isFavoriteTab
        ? '<button class="remove-server-btn" type="button" title="Hapus Server">&times;</button>'
        : "";

      tr.innerHTML =
        "<td>" + escapeHtml(status.name) + offlineBadge + "</td>" +
        "<td>" + escapeHtml(status.version) + "</td>" +
        "<td>" + escapeHtml(status.gamemode) + "</td>" +
        "<td class=\"servers-table__players\">" + escapeHtml(playersText) + "</td>" +
        "<td class=\"servers-table__ping\">" + escapeHtml(pingText) + "</td>" +
        "<td class=\"servers-table__lock\">" + lockIconHtml + "</td>" +
        "<td>" + actionCellHtml + "</td>";

      tr.addEventListener("click", (event) => {
        if (event.target.closest(".remove-server-btn")) {
          return;
        }
        openConnectModalFor(srv.host, srv.port, status);
      });

      const removeBtn = tr.querySelector(".remove-server-btn");
      if (removeBtn) {
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
      }

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
      if (settings && settings.lastSampVersion) {
        sampVersionSelect.value = settings.lastSampVersion;
      }
    } catch (err) {
      // gagal load username/versi terakhir bukan hal fatal
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

  const LOCK_ICON_LOCKED_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M8 11V7.5a4 4 0 0 1 8 0V11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<circle cx="12" cy="15.3" r="1.4" fill="currentColor"/>' +
    "</svg>";

  const LOCK_ICON_UNLOCKED_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M8 11V7.5a4 4 0 0 1 7.6-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<circle cx="12" cy="15.3" r="1.4" fill="currentColor"/>' +
    "</svg>";

  const LOCK_ICON_UNKNOWN_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M8 11V7.5a4 4 0 0 1 8 0V11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="1.5 2.5"/>' +
    '<circle cx="12" cy="15.3" r="1.2" fill="currentColor"/>' +
    "</svg>";

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

  async function performLaunch(playerName, serverPassword, sampVersion, triggerBtn, triggerDefaultText, onFinishClose) {
    const status = selectedServer.status || {};

    triggerBtn.disabled = true;
    triggerBtn.textContent = "Menghubungkan...";

    try {
      const result = await window.sampLauncher.launchSamp(
        selectedServer.host,
        selectedServer.port,
        playerName,
        {
          serverName: status.name,
          onlinePlayers: status.onlineCount,
          maxPlayers: status.maxCount
        },
        serverPassword,
        sampVersion
      );

      if (result && result.success) {
        showToast(result.message || "SA-MP sedang dijalankan...", "success");
        onFinishClose();
        return true;
      }

      return { message: result && result.message ? result.message : "Gagal menjalankan SA-MP" };
    } catch (err) {
      return { message: "Terjadi kesalahan: " + err.message };
    } finally {
      triggerBtn.disabled = false;
      triggerBtn.textContent = triggerDefaultText;
    }
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

    const status = selectedServer.status || {};
    const sampVersion = sampVersionSelect.value;

    if (status.locked === true) {
      pendingPlayerName = playerName;
      pendingSampVersion = sampVersion;
      closeModal();
      openPasswordModalFor(selectedServer.host, selectedServer.port);
      return;
    }

    const outcome = await performLaunch(playerName, "", sampVersion, connectBtn, "Connect", closeModal);
    if (outcome !== true && outcome) {
      showError(outcome.message);
    }
  }

  async function handlePasswordConnect() {
    if (!selectedServer) {
      showPasswordError("Pilih server dari daftar terlebih dahulu");
      return;
    }

    const serverPassword = serverPasswordInput.value;

    if (!serverPassword) {
      showPasswordError("Password server tidak boleh kosong");
      return;
    }

    clearPasswordError();

    const outcome = await performLaunch(pendingPlayerName, serverPassword, pendingSampVersion, passwordConnectBtn, "Connect", closePasswordModal);
    if (outcome !== true && outcome) {
      showPasswordError(outcome.message);
    }
  }

  function openPasswordModalFor(host, port) {
    passwordModalServerIpEl.textContent = host + ":" + port;
    serverPasswordInput.value = "";
    clearPasswordError();
    passwordModalOverlay.classList.add("active");
    setTimeout(() => serverPasswordInput.focus(), 150);
  }

  function closePasswordModal() {
    passwordModalOverlay.classList.remove("active");
    clearPasswordError();
    pendingPlayerName = "";
  }

  function showPasswordError(message) {
    passwordErrorMessage.textContent = message;
    passwordErrorMessage.classList.add("show");
    serverPasswordInput.classList.add("input-error");
  }

  function clearPasswordError() {
    passwordErrorMessage.textContent = "";
    passwordErrorMessage.classList.remove("show");
    serverPasswordInput.classList.remove("input-error");
  }

  cancelBtn.addEventListener("click", closeModal);
  connectBtn.addEventListener("click", handleConnect);

  passwordCancelBtn.addEventListener("click", closePasswordModal);
  passwordConnectBtn.addEventListener("click", handlePasswordConnect);

  serverPasswordInput.addEventListener("input", () => {
    if (serverPasswordInput.value) {
      clearPasswordError();
    }
  });

  serverPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handlePasswordConnect();
    }
  });

  passwordModalOverlay.addEventListener("click", (event) => {
    if (event.target === passwordModalOverlay) {
      closePasswordModal();
    }
  });

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
    if (passwordModalOverlay.classList.contains("active")) {
      closePasswordModal();
    }
    if (settingsModalOverlay.classList.contains("active")) {
      closeSettingsModal();
    }
    if (addServerModalOverlay.classList.contains("active")) {
      closeAddServerModal();
    }
  });

  themeToggleBtn.addEventListener("click", toggleTheme);

  function updateSortArrows() {
    sortableHeaders.forEach((th) => {
      const key = th.getAttribute("data-sort-key");
      const arrow = th.querySelector(".sort-arrow");
      if (key === currentSortKey) {
        th.classList.add("sort-active");
        arrow.textContent = currentSortDirection === "asc" ? "▲" : "▼";
      } else {
        th.classList.remove("sort-active");
        arrow.textContent = "";
      }
    });
  }

  sortableHeaders.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort-key");

      if (currentSortKey === key) {
        currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
      } else {
        currentSortKey = key;
        currentSortDirection = key === "players" || key === "ping" ? "desc" : "asc";
      }

      updateSortArrows();
      renderServersTable();
    });
  });

  serversTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (tab === currentTab) {
        return;
      }
      currentTab = tab;
      serversTabButtons.forEach((otherBtn) => {
        otherBtn.classList.toggle("active", otherBtn === btn);
      });
      renderServersTable();
    });
  });

  initTheme();
  loadServers();
  setInterval(refreshAllServerStatuses, STATUS_REFRESH_INTERVAL_MS);
})();