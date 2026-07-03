const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sampLauncher", {
  launchSamp: (serverIp, playerName) =>
    ipcRenderer.invoke("launch-samp", { serverIp, playerName }),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (gtaSaDirectory) =>
    ipcRenderer.invoke("save-settings", { gtaSaDirectory }),
  selectDirectory: () => ipcRenderer.invoke("select-directory")
});
