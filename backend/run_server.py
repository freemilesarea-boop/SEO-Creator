"""
PyInstaller용 백엔드 진입점

이 파일이 PyInstaller로 빌드되어 단일 실행 파일(seo-backend)이 된다.
실행 시 FastAPI 서버를 지정된 포트에서 시작한다.
"""

import sys
import os
import argparse

# PyInstaller 번들에서 실행 시 data 경로 보정
if getattr(sys, "frozen", False):
    # PyInstaller 번들 내부
    bundle_dir = sys._MEIPASS
    # 현재 실행 파일 위치의 data 폴더도 확인
    exe_dir = os.path.dirname(sys.executable)
else:
    bundle_dir = os.path.dirname(os.path.abspath(__file__))
    exe_dir = bundle_dir

# backend 패키지를 import할 수 있도록 path 설정
sys.path.insert(0, bundle_dir)


def main():
    parser = argparse.ArgumentParser(description="SEO Creator Backend")
    parser.add_argument("--port", type=int, default=18484)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()

    import uvicorn
    from backend.app.main import app

    # CORS에 file:// 추가 (Electron에서 로드 시)
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    print(f"[seo-backend] Starting on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
