# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for SEO Creator Backend

빌드 명령:
  cd backend
  pyinstaller seo-backend.spec

결과: dist/seo-backend (macOS/Linux) 또는 dist/seo-backend.exe (Windows)
"""

import os
import sys
from pathlib import Path

block_cipher = None

# 데이터 파일 수집
backend_root = os.path.abspath(".")
data_dir = os.path.join(backend_root, "app", "data")

datas = []
# keyword dictionary JSON 파일들
for f in Path(data_dir).glob("*.json"):
    datas.append((str(f), os.path.join("backend", "app", "data")))

# build_dictionary.py도 포함
build_dict = os.path.join(data_dir, "build_dictionary.py")
if os.path.exists(build_dict):
    datas.append((build_dict, os.path.join("backend", "app", "data")))

# backend 패키지 전체를 데이터로 포함 (import 구조 유지)
a = Analysis(
    ["run_server.py"],
    pathex=[backend_root, os.path.dirname(backend_root)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "fastapi",
        "fastapi.middleware",
        "fastapi.middleware.cors",
        "starlette",
        "starlette.routing",
        "starlette.middleware",
        "pydantic",
        "pydantic_settings",
        "pydantic_core",
        "sqlalchemy",
        "sqlalchemy.ext.asyncio",
        "aiosqlite",
        "httpx",
        "yt_dlp",
        "backend",
        "backend.app",
        "backend.app.main",
        "backend.app.config",
        "backend.app.api",
        "backend.app.api.routes",
        "backend.app.models",
        "backend.app.models.schemas",
        "backend.app.models.database",
        "backend.app.services",
        "backend.app.services.playlist_parser",
        "backend.app.services.metadata_analyzer",
        "backend.app.services.keyword_engine",
        "backend.app.services.title_generator",
        "backend.app.services.thumbnail_generator",
        "backend.app.services.coherence",
        "backend.app.services.trends_client",
        "backend.app.services.trends_cache",
        "backend.app.services.trends_ranker",
        "backend.app.services.intent_classifier",
        "backend.app.services.explainer",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "scipy", "numpy", "PIL", "cv2"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="seo-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # 서버이므로 콘솔 필요
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
