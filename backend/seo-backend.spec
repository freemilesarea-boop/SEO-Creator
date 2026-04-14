# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for SEO Creator Backend

빌드:
  cd backend
  pyinstaller seo-backend.spec --clean --noconfirm

결과: dist/seo-backend/ 디렉터리 (onedir 모드)
"""

import os
from pathlib import Path

block_cipher = None

backend_root = os.path.abspath(".")
project_root = os.path.dirname(backend_root)

# ── 데이터 파일 수집 ──

datas = []

# 1. backend 패키지 전체를 소스로 포함 (import 구조 유지)
#    backend/ → _MEIPASS/backend/
datas.append((backend_root, "backend"))

# ── Analysis ──

a = Analysis(
    ["run_server.py"],
    pathex=[project_root, backend_root],
    binaries=[],
    datas=datas,
    hiddenimports=[
        # uvicorn 내부 모듈 (lazy import)
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        # fastapi / starlette
        "fastapi",
        "fastapi.applications",
        "fastapi.routing",
        "fastapi.middleware",
        "fastapi.middleware.cors",
        "fastapi.responses",
        "fastapi.exceptions",
        "starlette",
        "starlette.applications",
        "starlette.routing",
        "starlette.middleware",
        "starlette.middleware.cors",
        "starlette.responses",
        "starlette.requests",
        "starlette.staticfiles",
        "starlette.exceptions",
        "starlette.concurrency",
        # pydantic
        "pydantic",
        "pydantic.fields",
        "pydantic_settings",
        "pydantic_core",
        "pydantic_core._pydantic_core",
        "annotated_types",
        # sqlalchemy
        "sqlalchemy",
        "sqlalchemy.ext.asyncio",
        "sqlalchemy.ext.asyncio.engine",
        "sqlalchemy.ext.asyncio.session",
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.pool",
        # aiosqlite
        "aiosqlite",
        # async
        "anyio",
        "anyio._backends",
        "anyio._backends._asyncio",
        "sniffio",
        # http
        "httpx",
        "httpcore",
        "h11",
        # yt-dlp
        "yt_dlp",
        # greenlet (sqlalchemy async)
        "greenlet",
        # dotenv
        "dotenv",
        "python_dotenv",
        # backend 패키지
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
    excludes=[
        "tkinter", "matplotlib", "scipy", "numpy", "PIL", "cv2",
        "pytest", "setuptools", "wheel", "pip",
        "cryptography",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ── onedir 모드 (디버깅 용이, 안정적) ──

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="seo-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="seo-backend",
)
