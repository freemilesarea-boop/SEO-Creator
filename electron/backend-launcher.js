/**
 * Backend Launcher (production-safe)
 *
 * FastAPI(uvicorn) 프로세스를 child_process로 관리한다.
 * - app.isPackaged 기준으로 경로 분리
 * - Python 실행 파일 다단계 fallback
 * - userData/backend.log에 전체 로깅
 * - 앱 종료 시 자동 정리
 */

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");

let backendProcess = null;
let logStream = null;

/**
 * 로그 파일 초기화
 */
function initLog(userDataPath) {
  try {
    const logPath = path.join(userDataPath, "backend.log");
    logStream = fs.createWriteStream(logPath, { flags: "a" });
    _log(`=== Backend launcher started at ${new Date().toISOString()} ===`);
    _log(`Platform: ${process.platform}, Arch: ${process.arch}`);
    _log(`UserData: ${userDataPath}`);
    return logPath;
  } catch (e) {
    console.error("[backend-log] Failed to init log:", e.message);
    return null;
  }
}

function _log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(`[backend] ${msg}`);
  if (logStream) {
    logStream.write(line + "\n");
  }
}

/**
 * Python 실행 파일 찾기 (다단계 fallback)
 */
function findPython() {
  // 1. 환경변수
  if (process.env.PYTHON_PATH) {
    _log(`Trying PYTHON_PATH: ${process.env.PYTHON_PATH}`);
    if (fs.existsSync(process.env.PYTHON_PATH)) {
      return process.env.PYTHON_PATH;
    }
  }

  // 2. 플랫폼별 well-known 경로
  const candidates =
    process.platform === "win32"
      ? ["python", "python3", "C:\\Python312\\python.exe", "C:\\Python311\\python.exe"]
      : [
          "/usr/bin/python3",
          "/usr/local/bin/python3",
          "/opt/homebrew/bin/python3",
          "/opt/homebrew/opt/python@3.12/bin/python3.12",
          "/opt/homebrew/opt/python@3.13/bin/python3.13",
          "python3",
          "python",
        ];

  for (const cmd of candidates) {
    try {
      if (cmd.includes("/") && !fs.existsSync(cmd)) continue;
      const version = execSync(`"${cmd}" --version 2>&1`, {
        timeout: 5000,
        encoding: "utf-8",
      }).trim();
      _log(`Found Python: ${cmd} (${version})`);
      return cmd;
    } catch (_) {
      // try next
    }
  }

  _log("WARNING: No Python found, using 'python3' as fallback");
  return "python3";
}

/**
 * 포트가 사용 중인지 확인
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * 사용 가능한 포트 찾기
 */
async function findAvailablePort(startPort) {
  let port = startPort;
  for (let i = 0; i < 10; i++) {
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
    port++;
  }
  throw new Error(`No available port found from ${startPort} to ${startPort + 9}`);
}

/**
 * 백엔드 프로세스 시작
 */
function startBackend(port, isPackaged, appPath) {
  if (backendProcess) return;

  // 경로 결정
  let backendCwd;
  if (isPackaged) {
    // 패키징된 앱: extraResources에 backend가 들어감
    backendCwd = path.join(process.resourcesPath, "backend-bundle");
    _log(`Mode: PACKAGED`);
    _log(`resourcesPath: ${process.resourcesPath}`);
  } else {
    // 개발 모드: 프로젝트 루트
    backendCwd = appPath || path.join(__dirname, "..");
    _log(`Mode: DEVELOPMENT`);
  }

  _log(`Backend CWD: ${backendCwd}`);

  // CWD 존재 확인
  if (!fs.existsSync(backendCwd)) {
    _log(`ERROR: Backend directory not found: ${backendCwd}`);
    return;
  }

  // backend/app/main.py 존재 확인
  const mainPy = path.join(backendCwd, "backend", "app", "main.py");
  if (!fs.existsSync(mainPy)) {
    _log(`ERROR: main.py not found at: ${mainPy}`);
    // extraResources 구조 다를 수 있으므로 ls로 확인
    try {
      const files = fs.readdirSync(backendCwd);
      _log(`Contents of ${backendCwd}: ${files.join(", ")}`);
    } catch (e) {
      _log(`Cannot read directory: ${e.message}`);
    }
    return;
  }
  _log(`Found main.py: ${mainPy}`);

  // Python 찾기
  const pythonCmd = findPython();

  const args = [
    "-m",
    "uvicorn",
    "backend.app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ];

  _log(`Command: ${pythonCmd} ${args.join(" ")}`);

  try {
    backendProcess = spawn(pythonCmd, args, {
      cwd: backendCwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
      },
    });
  } catch (err) {
    _log(`ERROR: spawn failed: ${err.message}`);
    backendProcess = null;
    return;
  }

  _log(`Process spawned: PID ${backendProcess.pid}`);

  backendProcess.stdout.on("data", (data) => {
    _log(`stdout: ${data.toString().trim()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    _log(`stderr: ${data.toString().trim()}`);
  });

  backendProcess.on("error", (err) => {
    _log(`ERROR: Process error: ${err.message}`);
    backendProcess = null;
  });

  backendProcess.on("exit", (code, signal) => {
    _log(`Process exited: code=${code}, signal=${signal}`);
    backendProcess = null;
  });
}

/**
 * 백엔드 프로세스 종료
 */
function stopBackend() {
  if (!backendProcess) return;

  _log("Stopping backend...");

  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"]);
    } else {
      backendProcess.kill("SIGTERM");
      setTimeout(() => {
        if (backendProcess) {
          try {
            backendProcess.kill("SIGKILL");
          } catch (_) {}
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

/**
 * 백엔드 health check 대기
 */
function waitForBackend(port, timeoutMs = 30000) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeoutMs) {
        _log(`ERROR: Health check timeout after ${timeoutMs}ms`);
        return reject(new Error(`Backend did not start within ${timeoutMs}ms`));
      }

      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/health`,
        (res) => {
          if (res.statusCode === 200) {
            _log(`Health check PASSED (${elapsed}ms)`);
            resolve();
          } else {
            setTimeout(check, 500);
          }
        }
      );

      req.on("error", () => {
        setTimeout(check, 500);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(check, 500);
      });
    }

    check();
  });
}

module.exports = { startBackend, stopBackend, waitForBackend, findAvailablePort, initLog };
