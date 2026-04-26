/**
 * Electron Preload — IPC bridge
 *
 * - renderer는 window.electronAPI 만 사용한다.
 * - ipcRenderer는 절대 노출하지 않는다 (contextIsolation 보장).
 * - 모든 메소드 이름은 camelCase로 통일.
 */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const api = {
  // env
  isElectron: true,
  platform: process.platform,

  // health
  healthCheck: () => invoke("engine:health"),

  // generate (기존 호환)
  generateManual: (input) => invoke("engine:generateManual", input),
  generateLink: (input) => invoke("engine:generateLink", input),

  // regenerate
  regenerateAll: (prev, opts) => invoke("engine:regenerate:all", prev, opts),
  regenerateSet: (prev, setKey, opts) => invoke("engine:regenerate:set", prev, setKey, opts),
  regenerateTitle: (prev, setKey, opts) => invoke("engine:regenerate:title", prev, setKey, opts),
  regenerateThumbnail: (prev, setKey, opts) => invoke("engine:regenerate:thumbnail", prev, setKey, opts),
  regenerateTags: (prev, setKey, opts) => invoke("engine:regenerate:tags", prev, setKey, opts),

  // favorites
  addFavorite: (record) => invoke("engine:favorite:add", record),
  removeFavorite: (id) => invoke("engine:favorite:remove", id),
  listFavorites: () => invoke("engine:favorite:list"),
  hasFavorite: (id) => invoke("engine:favorite:has", id),

  // history (기존 호환 + 신규)
  getHistory: (limit) => invoke("engine:getHistory", limit),
  getHistoryDetail: (id) => invoke("engine:history:get", id),
  removeHistory: (id) => invoke("engine:history:remove", id),

  // export
  exportJSON: (response) => invoke("engine:export:json", response),
  exportCSV: (response) => invoke("engine:export:csv", response),
  exportTXT: (response) => invoke("engine:export:txt", response),
  suggestExportFilename: (response, ext) => invoke("engine:export:filename", response, ext),
  saveExport: (response, format) => invoke("engine:export:save", response, format),
};

contextBridge.exposeInMainWorld("electronAPI", api);
