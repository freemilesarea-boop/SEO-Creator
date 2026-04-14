#!/bin/bash
# SEO Creator 앱 빌드 스크립트
# 프론트엔드 static export → Electron 패키징

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔════════════════════════════════════╗"
echo "║   SEO Creator - Build             ║"
echo "╚════════════════════════════════════╝"

# 1. 루트 의존성 설치
echo "[1/4] Installing root dependencies..."
npm install

# 2. 프론트엔드 빌드 (static export)
echo "[2/4] Building frontend (static export)..."
cd frontend
npm install
npm run build
cd "$PROJECT_ROOT"

# 3. 빌드 확인
if [ ! -f frontend/out/index.html ]; then
  echo "ERROR: frontend/out/index.html not found!"
  exit 1
fi
echo "[OK] Frontend built: frontend/out/"

# 4. Electron 패키징
echo "[3/4] Packaging with electron-builder..."

PLATFORM="${1:-current}"

case "$PLATFORM" in
  mac)
    npx electron-builder --mac
    ;;
  win)
    npx electron-builder --win
    ;;
  linux)
    npx electron-builder --linux
    ;;
  all)
    npx electron-builder --mac --win --linux
    ;;
  current|*)
    npx electron-builder
    ;;
esac

echo ""
echo "[4/4] Build complete!"
echo "Output: dist-app/"
ls -la dist-app/ 2>/dev/null || echo "(check dist-app/ for output files)"
