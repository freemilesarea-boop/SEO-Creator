/**
 * Backend Launcher (production-safe, v3)
 *
 * 핵심 수정 사항:
 * - app.isPackaged 기준 경로 분리 + 디렉터리 구조 로깅
 * - OS별 Python 실행 파일 탐색 (mac: python3, win: py → python)
 * - userData/backend.log에 모든 정보 기록
 * - spawn 실패 시 상세 원인 기록
 */

const { spawn, execSync, execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");

let backendProcess = null;
let logStream = null;
let _logPath = null;

// ── 로깅 ──

function initLog(userDataPath) {
  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    _logPath = path.join(userDataPath, "backend.log");
    // 로그 파일이 1MB 넘으면 초기화
    try {
      const stat = fs.statSync(_logPath);
      if (stat.size > 1024 * 1024) fs.unlinkSync(_logPath);
    } catch (_) {}
    logStream = fs.createWriteStream(_logPath, { flags: "a" });
    _log("========================================");
    _log(`Backend launcher started`);
    _log(`Platform: ${process.platform}, Arch: ${process.arch}`);
    _log(`Node: ${process.version}`);
    _log(`UserData: ${userDataPath}`);
    return _logPath;
  } catch (e) {
    console.error("[backend-log] Failed to init:", e.message);
    return null;
  }
}

function getLogPath() {
  return _logPath;
}

function _log(msg) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(`[backend] ${msg}`);
  if (logStream) {
    try { logStream.write(line + "\n"); } catch (_) {}
  }
}

// ── Python 탐색 ──

function findPython() {
  // 1. 환경변수
  if (process.env.PYTHON_PATH) {
    _log(`Checking PYTHON_PATH env: ${process.env.PYTHON_PATH}`);
    if (_testPython(process.env.PYTHON_PATH)) return process.env.PYTHON_PATH;
  }

  // 2. OS별 후보
  let candidates;
  if (process.platform === "win32") {
    candidates = [
      "py",
      "python",
      "python3",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311", "python.exe"),
      "C:\\Python312\\python.exe",
      "C:\\Python311\\python.exe",
    ];
  } else {
    candidates = [
      "/usr/bin/python3",
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3",
      "/opt/homebrew/opt/python@3.12/bin/python3.12",
      "/opt/homebrew/opt/python@3.13/bin/python3.13",
      "python3",
    ];
  }

  for (const cmd of candidates) {
    if (_testPython(cmd)) return cmd;
  }

  const fallback = process.platform === "win32" ? "python" : "python3";
  _log(`WARNING: No working Python found. Falling back to: ${fallback}`);
  return fallback;
}

function _testPython(cmd) {
  try {
    // 절대경로인데 파일이 없으면 스킵
    if ((cmd.includes("/") || cmd.includes("\\")) && !fs.existsSync(cmd)) {
      return false;
    }
    const out = execSync(`"${cmd}" --version 2>&1`, {
      timeout: 5000,
      encoding: "utf-8",
      windowsHide: true,
    }).trim();
    _log(`  OK: ${cmd} → ${out}`);
    return true;
  } catch (_) {
    _log(`  FAIL: ${cmd}`);
    return false;
  }
}

// ── 포트 ──

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => resolve(err.code === "EADDRINUSE"));
    server.once("listening", () => { server.close(); resolve(false); });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let i = 0; i < 10; i++) {
    if (!(await isPortInUse(startPort + i))) return startPort + i;
  }
  throw new Error(`No available port from ${startPort} to ${startPort + 9}`);
}

// ── 디렉터리 탐색 로깅 ──

function _logDirContents(dir, label, depth = 0) {
  if (depth > 2) return;
  try {
    const items = fs.readdirSync(dir);
    _log(`${label}: [${items.join(", ")}]`);
    if (depth < 1) {
      for (const item of items) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory() && !item.startsWith(".") && item !== "__pycache__") {
          _logDirContents(full, `  ${label}/${item}`, depth + 1);
        }
      }
    }
  } catch (e) {
    _log(`${label}: CANNOT READ (${e.message})`);
  }
}

// ── 번들 바이너리 경로 탐색 ──

function _findBundledBinary(resourcesPath) {
  const binName = process.platform === "win32" ? "seo-backend.exe" : "seo-backend";
  // onedir 모드: backend-bundle/seo-backend (실행 파일이 폴더 안에)
  const candidates = [
    path.join(resourcesPath, "backend-bundle", binName),
    path.join(resourcesPath, binName),
  ];
  for (const p of candidates) {
    _log(`Checking binary: ${p} → ${fs.existsSync(p) ? "EXISTS" : "NOT FOUND"}`);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// ── 백엔드 시작 ──

function startBackend(port, isPackaged, appPath, userDataPath) {
  if (backendProcess) return;

  _log(`--- startBackend ---`);
  _log(`isPackaged: ${isPackaged}`);
  _log(`appPath: ${appPath}`);
  _log(`userDataPath: ${userDataPath}`);
  _log(`resourcesPath: ${process.resourcesPath}`);

  let cmd, args, cwd;

  if (isPackaged) {
    // 1순위: 번들 바이너리 (seo-backend / seo-backend.exe)
    const binary = _findBundledBinary(process.resourcesPath);
    if (binary) {
      _log(`MODE: BUNDLED BINARY`);
      cmd = binary;
      args = ["--host", "127.0.0.1", "--port", String(port)];
      cwd = path.dirname(binary);

      // 실행 권한 확인 (macOS/Linux)
      if (process.platform !== "win32") {
        try { fs.chmodSync(binary, 0o755); } catch (_) {}
      }
    } else {
      // 2순위: Python + extraResources 소스
      _log(`MODE: PACKAGED PYTHON (no binary found)`);
      const backendCwd = path.join(process.resourcesPath, "backend-bundle");
      if (!fs.existsSync(backendCwd)) {
        _log(`ERROR: ${backendCwd} not found`);
        _logDirContents(process.resourcesPath, "resources");
        return;
      }
      _logDirContents(backendCwd, "backend-bundle");

      const mainPy = path.join(backendCwd, "backend", "app", "main.py");
      if (!fs.existsSync(mainPy)) {
        _log(`ERROR: main.py not found at ${mainPy}`);
        return;
      }

      const pythonCmd = findPython();
      cmd = pythonCmd;
      args = ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", String(port)];
      cwd = backendCwd;
    }
  } else {
    // 개발 모드: Python 직접 실행
    _log(`MODE: DEVELOPMENT`);
    const devCwd = appPath || path.join(__dirname, "..");
    const pythonCmd = findPython();
    cmd = pythonCmd;
    args = ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", String(port)];
    cwd = devCwd;
  }

  _log(`Command: ${cmd}`);
  _log(`Args: ${args.join(" ")}`);
  _log(`CWD: ${cwd}`);
  _log(`DB dir (SEO_CREATOR_APPDATA_DIR): ${userDataPath || "(not set)"}`);

  // spawn
  try {
    backendProcess = spawn(cmd, args, {
      cwd: cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
        SEO_CREATOR_APPDATA_DIR: userDataPath || "",
      },
    });
  } catch (err) {
    _log(`SPAWN ERROR: ${err.message}`);
    _log(`Stack: ${err.stack}`);
    backendProcess = null;
    return;
  }

  if (!backendProcess || !backendProcess.pid) {
    _log(`ERROR: spawn returned no PID`);
    backendProcess = null;
    return;
  }

  _log(`Spawned PID: ${backendProcess.pid}`);

  backendProcess.stdout.on("data", (data) => {
    _log(`stdout: ${data.toString().trim()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    _log(`stderr: ${data.toString().trim()}`);
  });

  backendProcess.on("error", (err) => {
    _log(`PROCESS ERROR: ${err.message}`);
    backendProcess = null;
  });

  backendProcess.on("exit", (code, signal) => {
    _log(`PROCESS EXIT: code=${code}, signal=${signal}`);
    backendProcess = null;
  });
}

// ── 백엔드 종료 ──

function stopBackend() {
  if (!backendProcess) return;
  _log("Stopping backend...");
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"], { windowsHide: true });
    } else {
      backendProcess.kill("SIGTERM");
      setTimeout(() => {
        if (backendProcess) {
          try { backendProcess.kill("SIGKILL"); } catch (_) {}
        }
      }, 2000);
    }
  } catch (_) {}
  backendProcess = null;
  if (logStream) {
    _log("Backend stopped.");
    logStream.end();
    logStream = null;
  }
}

// ── Health check ──

function waitForBackend(port, timeoutMs = 30000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const elapsed = Date.now() - startTime;

      // 프로세스가 이미 죽었으면 즉시 실패
      if (!backendProcess) {
        _log(`ERROR: Backend process died before health check passed`);
        return reject(new Error("Backend process exited unexpectedly. Check backend.log for details."));
      }

      if (elapsed > timeoutMs) {
        _log(`ERROR: Health check timeout (${timeoutMs}ms)`);
        return reject(new Error(`Backend did not start within ${Math.round(timeoutMs / 1000)}s. Check backend.log for details.`));
      }

      const req = http.get(`http://127.0.0.1:${port}/api/v1/health`, (res) => {
        if (res.statusCode === 200) {
          _log(`Health check PASSED (${elapsed}ms)`);
          resolve();
        } else {
          setTimeout(check, 500);
        }
      });
      req.on("error", () => setTimeout(check, 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 500); });
    }
    // 첫 체크를 1초 후 시작 (프로세스 시작 시간 확보)
    setTimeout(check, 1000);
  });
}

module.exports = { startBackend, stopBackend, waitForBackend, findAvailablePort, initLog, getLogPath };
