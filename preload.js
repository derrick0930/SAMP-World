const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sampLauncher", {
  launchSamp: (serverIp, playerName, serverInfo) =>
    ipcRenderer.invoke("launch-samp", {
      serverIp,
      playerName,
      serverName: serverInfo && serverInfo.serverName,
      onlinePlayers: serverInfo && serverInfo.onlinePlayers,
      maxPlayers: serverInfo && serverInfo.maxPlayers
    }),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (gtaSaDirectory) =>
    ipcRenderer.invoke("save-settings", { gtaSaDirectory }),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  getDiscordStatus: () => ipcRenderer.invoke("get-discord-status"),
  saveTheme: (theme) => ipcRenderer.invoke("save-theme", { theme })
});