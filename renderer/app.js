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

  const serverNameEl = document.getElementById("server-name");
  const statusDotEl = document.getElementById("status-dot");
  const statusTextEl = document.getElementById("status-text");
  const playerCountEl = document.getElementById("player-count");

  let toastTimeout = null;

  function openModal() {
    usernameInput.value = "";
    clearError();
    modalOverlay.classList.add("active");
    setTimeout(() => usernameInput.focus(), 150);
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
    }
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

    clearError();
    connectBtn.disabled = true;
    connectBtn.textContent = "Menghubungkan...";

    try {
      const result = await window.sampLauncher.launchSamp(SERVER_IP, playerName);

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

  refreshServerStatus();
  setInterval(refreshServerStatus, STATUS_REFRESH_INTERVAL_MS);
})();