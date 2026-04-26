#!/bin/bash
# SEO Creator 앱 빌드 스크립트 (v2.1, Node-only)
# 1. 엔진 자가검증
# 2. Next.js 정적 익스포트
# 3. Electron 패키징

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔════════════════════════════════════╗"
echo "║   SEO Creator - Full Build (v2.1) ║"
echo "╚════════════════════════════════════╝"

# 1. 의존성
echo "[1/4] Installing dependencies..."
npm install
cd frontend && npm install && cd "$PROJECT_ROOT"

# 2. 엔진 자가검증
echo "[2/4] Engine self-check..."
node scripts/test-engine.js || { echo "[FAIL] Engine self-check failed."; exit 1; }

# 3. 프론트 정적 빌드
echo "[3/4] Building frontend (static export)..."
cd frontend && npm run build && cd "$PROJECT_ROOT"
if [ ! -f frontend/out/index.html ]; then
  echo "ERROR: frontend/out/index.html not found!"
  exit 1
fi
echo "[OK] frontend/out built"

# 4. Electron 패키징
echo "[4/4] Packaging Electron app..."
PLATFORM="${1:-current}"
case "$PLATFORM" in
  mac)    npx electron-builder --mac ;;
  win)    npx electron-builder --win ;;
  linux)  npx electron-builder --linux ;;
  all)    npx electron-builder --mac --win --linux ;;
  *)      npx electron-builder ;;
esac

echo ""
echo "Build complete! Output: dist-app/"
ls -la dist-app/ 2>/dev/null || echo "(check dist-app/)"
