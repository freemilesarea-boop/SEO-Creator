#!/bin/bash
# SEO Creator 개발 모드 실행 스크립트
# Next.js dev server + Electron (Node 엔진 직접 호출)
# Python 백엔드 의존성 없음.

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "╔════════════════════════════════════╗"
echo "║   SEO Creator - Dev Mode (v2.1)   ║"
echo "╚════════════════════════════════════╝"

# 의존성 확인
if [ ! -d "node_modules" ]; then
  echo "[setup] root npm install..."
  npm install
fi
if [ ! -d "frontend/node_modules" ]; then
  echo "[setup] frontend npm install..."
  cd frontend && npm install && cd "$PROJECT_ROOT"
fi

# 엔진 자가검증
echo "[1/2] Engine self-check..."
node scripts/test-engine.js || {
  echo "[FAIL] Engine self-check failed."
  exit 1
}

echo "[2/2] Starting frontend (3000) + Electron..."
npm run dev
