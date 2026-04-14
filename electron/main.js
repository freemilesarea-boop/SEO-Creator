/**
 * Electron Main Process
 *
 * 1. FastAPI 백엔드를 child_process로 실행
 * 2. 백엔드 health check 통과될 때까지 대기
 * 3. Next.js static export 된 HTML을 BrowserWindow에 로드
 */

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { startBackend, stopBackend, waitForBackend } = require("./backend-launcher");

let mainWindow = null;

const isDev = process.env.ELECTRON_DEV === "true";
const BACKEND_PORT = 18484; // 충돌 피하기 위해 비표준 포트 사용

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
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
      <div class="sub">서버를 시작하는 중...</div>
      <div class="loader"></div>
    </body>
    </html>
  `)}`
  );

  return splash;
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

  // 외부 링크는 기본 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    // 개발 모드: Next.js dev server
    mainWindow.loadURL("http://localhost:3000");
  } else {
    // 프로덕션: static export 파일 로드
    const indexPath = path.join(__dirname, "..", "frontend", "out", "index.html");
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.on("ready", async () => {
  const splash = createSplashWindow();

  try {
    // 백엔드 시작
    startBackend(BACKEND_PORT, isDev);

    // health check 대기 (최대 30초)
    await waitForBackend(BACKEND_PORT, 30000);

    // 메인 윈도우 생성
    const win = createMainWindow();

    win.once("ready-to-show", () => {
      splash.destroy();
      win.show();
    });

    // ready-to-show가 안 올 경우 타임아웃
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) {
        splash.destroy();
      }
      if (win && !win.isVisible()) {
        win.show();
      }
    }, 8000);
  } catch (err) {
    splash.destroy();
    const win = createMainWindow();
    win.show();
    console.error("Backend start failed:", err.message);
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
