#!/bin/bash
# SEO Creator 앱 빌드 스크립트
# 1. Python 백엔드 → PyInstaller 단일 바이너리
# 2. Next.js 프론트엔드 → static export
# 3. Electron 패키징 (바이너리 포함)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔════════════════════════════════════╗"
echo "║   SEO Creator - Full Build        ║"
echo "╚════════════════════════════════════╝"

# 1. Python 의존성 + PyInstaller
echo "[1/5] Building backend binary..."
cd backend
pip install pyinstaller 2>/dev/null || pip3 install pyinstaller
pip install -r requirements.txt 2>/dev/null || pip3 install -r requirements.txt
pyinstaller seo-backend.spec --clean --noconfirm
cd "$PROJECT_ROOT"

# 바이너리 확인
if [ -f backend/dist/seo-backend ] || [ -f backend/dist/seo-backend.exe ]; then
  echo "[OK] Backend binary built"
  ls -la backend/dist/seo-backend* 2>/dev/null
else
  echo "ERROR: Backend binary not found in backend/dist/"
  exit 1
fi

# 2. 루트 의존성
echo "[2/5] Installing root dependencies..."
npm install

# 3. 프론트엔드 빌드
echo "[3/5] Building frontend..."
cd frontend
npm install
npm run build
cd "$PROJECT_ROOT"

if [ ! -f frontend/out/index.html ]; then
  echo "ERROR: frontend/out/index.html not found!"
  exit 1
fi
echo "[OK] Frontend built"

# 4. Electron 패키징
echo "[4/5] Packaging Electron app..."

PLATFORM="${1:-current}"

case "$PLATFORM" in
  mac)    npx electron-builder --mac ;;
  win)    npx electron-builder --win ;;
  linux)  npx electron-builder --linux ;;
  all)    npx electron-builder --mac --win --linux ;;
  *)      npx electron-builder ;;
esac

echo ""
echo "[5/5] Build complete!"
echo "Output: dist-app/"
ls -la dist-app/ 2>/dev/null || echo "(check dist-app/)"
