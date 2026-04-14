/**
 * Electron Main Process (v3)
 *
 * 1. 스플래시 표시
 * 2. FastAPI 백엔드 child_process 실행
 * 3. Health check 성공 → 메인 UI
 * 4. 실패 → 에러 화면 (로그 경로 + 내용 표시)
 */

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { startBackend, stopBackend, waitForBackend, initLog, getLogPath } = require("./backend-launcher");

let mainWindow = null;

const isDev = !app.isPackaged;
const BACKEND_PORT = 18484;

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
body { margin:0; display:flex; align-items:center; justify-content:center;
  height:100vh; background:#09090b; color:#e4e4e7;
  font-family:system-ui,-apple-system,sans-serif; flex-direction:column; border-radius:12px; }
.title { font-size:28px; font-weight:700; margin-bottom:8px; }
.accent { color:#a78bfa; }
.sub { font-size:13px; color:#71717a; margin-bottom:24px; }
.loader { width:32px; height:32px; border:3px solid #27272a;
  border-top-color:#7c3aed; border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
</style></head><body>
<div class="title"><span class="accent">SEO</span> Creator</div>
<div class="sub">백엔드를 시작하는 중...</div>
<div class="loader"></div>
</body></html>`)}`
  );

  return splash;
}

function createErrorWindow(errorMsg) {
  const win = new BrowserWindow({
    width: 560,
    height: 520,
    frame: true,
    resizable: true,
    title: "SEO Creator - 오류",
    backgroundColor: "#09090b",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const logFilePath = getLogPath() || path.join(app.getPath("userData"), "backend.log");

  // 로그 파일 마지막 30줄 읽기
  let logTail = "";
  try {
    const content = fs.readFileSync(logFilePath, "utf-8");
    const lines = content.split("\n");
    logTail = lines.slice(-30).join("\n");
  } catch (_) {
    logTail = "(로그 파일을 읽을 수 없습니다)";
  }

  const escaped = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
body { margin:0; padding:24px; background:#09090b; color:#e4e4e7;
  font-family:system-ui,-apple-system,sans-serif; }
h1 { font-size:20px; color:#ef4444; margin-bottom:8px; }
.msg { font-size:13px; color:#a1a1aa; line-height:1.6; margin-bottom:16px; }
.hint { font-size:12px; color:#71717a; margin-bottom:12px; }
code { background:#27272a; padding:2px 6px; border-radius:4px; font-size:11px; color:#e4e4e7; }
.logbox { font-size:10px; color:#52525b; background:#18181b; padding:12px;
  border-radius:8px; max-height:200px; overflow-y:auto; white-space:pre-wrap;
  word-break:break-all; font-family:monospace; border:1px solid #27272a; }
.path { font-size:11px; color:#71717a; margin-top:8px; }
</style></head><body>
<h1>백엔드 시작 실패</h1>
<div class="msg">${escaped(errorMsg)}</div>
<div class="hint">확인 사항:</div>
<div class="msg">
  1. Python 3.11+ 설치: <code>python3 --version</code><br/>
  2. pip 패키지 설치: <code>pip3 install fastapi uvicorn pydantic pydantic-settings yt-dlp httpx sqlalchemy aiosqlite</code><br/>
  3. 포트 18484 사용 중인지 확인: <code>lsof -i :18484</code>
</div>
<div class="hint">최근 로그:</div>
<div class="logbox">${escaped(logTail)}</div>
<div class="path">전체 로그: ${escaped(logFilePath)}</div>
</body></html>`)}`
  );

  return win;
}

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
    // app.getAppPath() = asar 내부 루트. frontend/out은 asar 안에 포함됨.
    const indexPath = path.join(app.getAppPath(), "frontend", "out", "index.html");
    console.log(`[main] Loading index: ${indexPath}`);
    console.log(`[main] Exists: ${fs.existsSync(indexPath)}`);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => { mainWindow = null; });
  return mainWindow;
}

app.on("ready", async () => {
  const logPath = initLog(app.getPath("userData"));

  console.log(`[main] isDev=${isDev}, isPackaged=${app.isPackaged}`);
  console.log(`[main] appPath=${app.getAppPath()}`);
  console.log(`[main] resourcesPath=${process.resourcesPath}`);
  console.log(`[main] platform=${process.platform}`);
  if (logPath) console.log(`[main] Log: ${logPath}`);

  const splash = createSplashWindow();

  try {
    startBackend(BACKEND_PORT, app.isPackaged, app.getAppPath());
    await waitForBackend(BACKEND_PORT, 30000);

    const win = createMainWindow();
    win.once("ready-to-show", () => {
      if (splash && !splash.isDestroyed()) splash.destroy();
      win.show();
    });

    // ready-to-show 안 오면 8초 후 강제 표시
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) splash.destroy();
      if (win && !win.isVisible()) win.show();
    }, 8000);
  } catch (err) {
    console.error("[main] Backend failed:", err.message);
    if (splash && !splash.isDestroyed()) splash.destroy();
    createErrorWindow(err.message);
  }
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createMainWindow().show();
});

app.on("before-quit", () => {
  stopBackend();
});
