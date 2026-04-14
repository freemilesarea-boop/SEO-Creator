#!/bin/bash
# SEO Creator 개발 모드 실행 스크립트
# 백엔드(FastAPI) + 프론트엔드(Next.js) + Electron 동시 실행

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔════════════════════════════════════╗"
echo "║   SEO Creator - Dev Mode          ║"
echo "╚════════════════════════════════════╝"

# 백엔드 시작
echo "[1/3] Starting backend (port 18484)..."
cd backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 18484 --reload &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

# 프론트엔드 시작
echo "[2/3] Starting frontend (port 3000)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd "$PROJECT_ROOT"

# 백엔드 준비 대기
echo "[...] Waiting for backend..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:18484/api/v1/health > /dev/null 2>&1; then
    echo "[OK] Backend ready!"
    break
  fi
  sleep 1
done

# Electron 시작
echo "[3/3] Starting Electron..."
sleep 2
ELECTRON_DEV=true npx electron . &
ELECTRON_PID=$!

echo ""
echo "All services running:"
echo "  Backend:  http://127.0.0.1:18484"
echo "  Frontend: http://localhost:3000"
echo "  Electron: PID $ELECTRON_PID"
echo ""
echo "Press Ctrl+C to stop all."

# 종료 핸들링
cleanup() {
  echo ""
  echo "Stopping all services..."
  kill $BACKEND_PID $FRONTEND_PID $ELECTRON_PID 2>/dev/null
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

wait
