/**
 * Electron Main Process
 *
 * 1. FastAPI 백엔드를 child_process로 실행
 * 2. 백엔드 health check 통과될 때까지 대기 (스플래시)
 * 3. 성공 시 메인 UI 표시, 실패 시 에러 화면 표시
 */

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { startBackend, stopBackend, waitForBackend, initLog } = require("./backend-launcher");

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
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head><style>
      body {
        margin: 0; display: flex; align-items: center; justify-content: center;
        height: 100vh; background: #09090b; color: #e4e4e7;
        font-family: system-ui, -apple-system, sans-serif;
        flex-direction: column; border-radius: 12px;
      }
      .title { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
      .accent { color: #a78bfa; }
      .sub { font-size: 13px; color: #71717a; margin-bottom: 24px; }
      .loader {
        width: 32px; height: 32px; border: 3px solid #27272a;
        border-top-color: #7c3aed; border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style></head>
    <body>
      <div class="title"><span class="accent">SEO</span> Creator</div>
      <div class="sub">백엔드를 시작하는 중...</div>
      <div class="loader"></div>
    </body>
    </html>
  `)}`
  );

  return splash;
}

function createErrorWindow(errorMsg) {
  const win = new BrowserWindow({
    width: 500,
    height: 400,
    frame: true,
    resizable: false,
    title: "SEO Creator - Error",
    backgroundColor: "#09090b",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const logPath = path.join(app.getPath("userData"), "backend.log");

  win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head><style>
      body {
        margin: 0; padding: 32px; background: #09090b; color: #e4e4e7;
        font-family: system-ui, -apple-system, sans-serif;
      }
      h1 { font-size: 22px; color: #ef4444; margin-bottom: 12px; }
      .msg { font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 20px; }
      .path { font-size: 11px; color: #52525b; background: #18181b; padding: 12px; border-radius: 8px; word-break: break-all; }
      .hint { font-size: 12px; color: #71717a; margin-top: 16px; }
      code { background: #27272a; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    </style></head>
    <body>
      <h1>백엔드 시작 실패</h1>
      <div class="msg">${errorMsg}</div>
      <div class="hint">확인 사항:</div>
      <div class="msg">
        1. Python 3.11+ 설치 확인: <code>python3 --version</code><br/>
        2. pip 패키지 설치: <code>pip3 install -r requirements.txt</code><br/>
        3. 포트 18484 사용 중인지 확인
      </div>
      <div class="path">로그 파일: ${logPath}</div>
    </body>
    </html>
  `)}`
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
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
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
    // 개발 모드: Next.js dev server
    mainWindow.loadURL("http://localhost:3000");
  } else {
    // 프로덕션: static export 파일 (app.asar 내부 또는 files에 포함)
    const indexPath = path.join(app.getAppPath(), "frontend", "out", "index.html");
    console.log(`[main] Loading: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.on("ready", async () => {
  // 로그 초기화
  const logPath = initLog(app.getPath("userData"));
  console.log(`[main] isDev=${isDev}, isPackaged=${app.isPackaged}`);
  console.log(`[main] appPath=${app.getAppPath()}`);
  console.log(`[main] resourcesPath=${process.resourcesPath}`);
  if (logPath) console.log(`[main] Log: ${logPath}`);

  const splash = createSplashWindow();

  try {
    // 백엔드 시작 (isPackaged 기반 경로 결정)
    startBackend(BACKEND_PORT, app.isPackaged, app.getAppPath());

    // health check 대기 (최대 30초)
    await waitForBackend(BACKEND_PORT, 30000);

    // 메인 윈도우 생성
    const win = createMainWindow();

    win.once("ready-to-show", () => {
      if (splash && !splash.isDestroyed()) splash.destroy();
      win.show();
    });

    // ready-to-show 타임아웃 보호
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) splash.destroy();
      if (win && !win.isVisible()) win.show();
    }, 8000);
  } catch (err) {
    console.error("[main] Backend start failed:", err.message);
    if (splash && !splash.isDestroyed()) splash.destroy();
    createErrorWindow(err.message);
  }
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createMainWindow().show();
  }
});

app.on("before-quit", () => {
  stopBackend();
});
