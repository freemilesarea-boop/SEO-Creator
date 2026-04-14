/**
 * Electron Main Process (v4 - No Python, No Server)
 *
 * 모든 SEO 로직을 Node.js engine에서 직접 실행.
 * FastAPI/Python/uvicorn 완전 제거.
 */

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");

let mainWindow = null;
const isDev = !app.isPackaged;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: "SEO Creator",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 16 } : undefined,
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

  mainWindow.on("closed", () => { mainWindow = null; });
  return mainWindow;
}

app.on("ready", () => {
  // Engine 초기화
  const engine = require("../engine");
  engine.initHistory(app.getPath("userData"));

  // IPC 핸들러 등록
  ipcMain.handle("engine:health", () => engine.healthCheck());

  ipcMain.handle("engine:generateManual", (_, input) => {
    try { return { ok: true, data: engine.generateFromManual(input) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle("engine:generateLink", async (_, input) => {
    try { return { ok: true, data: await engine.generateFromLink(input) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle("engine:getHistory", (_, limit) => {
    try { return { ok: true, data: engine.getHistory(limit) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // 윈도우 생성
  const win = createMainWindow();
  win.once("ready-to-show", () => win.show());
  setTimeout(() => { if (win && !win.isVisible()) win.show(); }, 5000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createMainWindow().show();
});
