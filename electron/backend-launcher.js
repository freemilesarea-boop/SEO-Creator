/**
 * Backend Launcher
 *
 * FastAPI(uvicorn) 프로세스를 child_process로 관리한다.
 * - 앱 시작 시 자동 실행
 * - 포트 충돌 감지 및 재시도
 * - health check로 준비 상태 확인
 * - 앱 종료 시 자동 정리
 */

const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");

let backendProcess = null;

/**
 * 포트가 사용 중인지 확인
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve(true);
      else resolve(false);
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
function startBackend(port, isDev) {
  if (backendProcess) return;

  const projectRoot = isDev
    ? path.join(__dirname, "..")
    : path.join(process.resourcesPath, "backend-bundle");

  const backendDir = isDev ? projectRoot : projectRoot;

  // Python 실행 파일 경로
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  const args = [
    "-m",
    "uvicorn",
    "backend.app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ];

  console.log(`[backend] Starting: ${pythonCmd} ${args.join(" ")}`);
  console.log(`[backend] CWD: ${backendDir}`);

  backendProcess = spawn(pythonCmd, args, {
    cwd: backendDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });

  backendProcess.stdout.on("data", (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.on("error", (err) => {
    console.error(`[backend] Failed to start: ${err.message}`);
    backendProcess = null;
  });

  backendProcess.on("exit", (code) => {
    console.log(`[backend] Exited with code ${code}`);
    backendProcess = null;
  });
}

/**
 * 백엔드 프로세스 종료
 */
function stopBackend() {
  if (!backendProcess) return;

  console.log("[backend] Stopping...");

  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"]);
    } else {
      backendProcess.kill("SIGTERM");
      // 2초 후에도 살아있으면 강제 종료
      setTimeout(() => {
        if (backendProcess) {
          try {
            backendProcess.kill("SIGKILL");
          } catch (_) {
            // already dead
          }
        }
      }, 2000);
    }
  } catch (_) {
    // ignore
  }
  backendProcess = null;
}

/**
 * 백엔드 health check 대기
 */
function waitForBackend(port, timeoutMs = 30000) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - startTime > timeoutMs) {
        return reject(new Error(`Backend did not start within ${timeoutMs}ms`));
      }

      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/health`,
        (res) => {
          if (res.statusCode === 200) {
            console.log("[backend] Ready!");
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

module.exports = { startBackend, stopBackend, waitForBackend, findAvailablePort };
