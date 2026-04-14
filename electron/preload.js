/**
 * Electron Preload Script
 *
 * contextBridge로 렌더러에 안전하게 API 노출
 */

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,
});
