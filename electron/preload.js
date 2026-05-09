/**
 * Electron Preload – IPC bridge
 *
 * renderer에서 window.electronAPI 로 engine 호출
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  healthCheck: () => ipcRenderer.invoke("engine:health"),

  generateManual: (input) => ipcRenderer.invoke("engine:generateManual", input),

  generateLink: (input) => ipcRenderer.invoke("engine:generateLink", input),

  regenerate: (generationId) => ipcRenderer.invoke("engine:regenerate", generationId),

  getHistory: (limit) => ipcRenderer.invoke("engine:getHistory", limit),
});
