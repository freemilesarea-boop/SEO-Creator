/**
 * Electron Main Process
 *
 * - 모든 비즈니스 로직은 engine/index.js helpers에 위임.
 * - 이 파일은 IPC 채널 등록과 lifecycle만 담당한다.
 * - 응답 정규화: { ok: true, data } | { ok: false, error: string }
 *   (단, 기존 호환을 위해 engine:health는 객체를 그대로 반환.)
 */

"use strict";

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const engine = require("../engine");

let mainWindow = null;
const isDev = !app.isPackaged;

// ── window ──

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: "SEO Creator",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition:
      process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
    backgroundColor: "#09090b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "frontend", "out", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

// ── IPC normalization ──
//
// Outer shape: 모든 채널은 { ok: true, data } | { ok: false, error: string }.
// Helper 모듈(regenerate / favorites)이 이미 { ok, response | error | total }
// 형태로 반환할 때는 평탄화하여 일관성을 유지한다.

function _normalize(r) {
  if (r === null || typeof r !== "object" || Array.isArray(r)) {
    return { ok: true, data: r };
  }
  if (Object.prototype.hasOwnProperty.call(r, "ok")) {
    if (r.ok === false) {
      return { ok: false, error: r.error || "unknown error" };
    }
    if (r.response !== undefined) return { ok: true, data: r.response };
    const { ok, ...rest } = r;
    return { ok: true, data: rest };
  }
  return { ok: true, data: r };
}

const _wrap = (fn) => async (_event, ...args) => {
  try {
    return _normalize(await fn(...args));
  } catch (e) {
    const msg = (e && e.message) || (typeof e === "string" ? e : "unknown error");
    return { ok: false, error: msg };
  }
};

function _registerHandlers() {
  // health (기존 호환 — 객체 직접 반환)
  ipcMain.handle("engine:health", () => engine.healthCheck());

  // generate (기존 채널 + 호환 형태 유지)
  ipcMain.handle("engine:generateManual", _wrap((input) => engine.generateFromManual(input)));
  ipcMain.handle("engine:generateLink", _wrap((input) => engine.generateFromLink(input)));

  // regenerate
  ipcMain.handle("engine:regenerate:all",
    _wrap((prev, opts) => engine.regenerateAll(prev, opts)));
  ipcMain.handle("engine:regenerate:set",
    _wrap((prev, setKey, opts) => engine.regenerateSet(prev, setKey, opts)));
  ipcMain.handle("engine:regenerate:title",
    _wrap((prev, setKey, opts) => engine.regenerateTitle(prev, setKey, opts)));
  ipcMain.handle("engine:regenerate:thumbnail",
    _wrap((prev, setKey, opts) => engine.regenerateThumbnail(prev, setKey, opts)));
  ipcMain.handle("engine:regenerate:tags",
    _wrap((prev, setKey, opts) => engine.regenerateTags(prev, setKey, opts)));

  // favorites
  ipcMain.handle("engine:favorite:add",    _wrap((record) => engine.addFavorite(record)));
  ipcMain.handle("engine:favorite:remove", _wrap((id) => engine.removeFavorite(id)));
  ipcMain.handle("engine:favorite:list",   _wrap(() => engine.listFavorites()));
  ipcMain.handle("engine:favorite:has",    _wrap((id) => engine.hasFavorite(id)));

  // history (기존 engine:getHistory 호환 유지 + 신규)
  ipcMain.handle("engine:getHistory",     _wrap((limit) => engine.getHistory(limit)));
  ipcMain.handle("engine:history:list",   _wrap((limit) => engine.getHistory(limit)));
  ipcMain.handle("engine:history:get",    _wrap((id) => engine.getHistoryDetail(id)));
  ipcMain.handle("engine:history:remove", _wrap((id) => engine.removeHistory(id)));

  // export
  ipcMain.handle("engine:export:json",     _wrap((response) => engine.exportJSON(response)));
  ipcMain.handle("engine:export:csv",      _wrap((response) => engine.exportCSV(response)));
  ipcMain.handle("engine:export:txt",      _wrap((response) => engine.exportTXT(response)));
  ipcMain.handle("engine:export:filename",
    _wrap((response, ext) => engine.suggestExportFilename(response, ext)));
}

// ── lifecycle ──

app.on("ready", () => {
  // 통합 stores 초기화 (history + favorites)
  engine.initStores(app.getPath("userData"));

  _registerHandlers();

  const win = createMainWindow();
  win.once("ready-to-show", () => win.show());
  setTimeout(() => {
    if (win && !win.isVisible()) win.show();
  }, 5000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createMainWindow().show();
});
