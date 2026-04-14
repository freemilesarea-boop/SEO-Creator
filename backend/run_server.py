"""
PyInstaller용 백엔드 진입점

빌드 후 단독 실행:
  ./dist/seo-backend/seo-backend --port 18484

환경변수:
  SEO_CREATOR_APPDATA_DIR: writable data 디렉터리 (DB, 캐시 저장)
"""

import sys
import os

# PyInstaller 번들 경로 보정 (반드시 import 전에 실행)
if getattr(sys, "frozen", False):
    _bundle_dir = sys._MEIPASS
else:
    _bundle_dir = os.path.dirname(os.path.abspath(__file__))

# backend 패키지를 찾을 수 있도록 path 최상위에 추가
if _bundle_dir not in sys.path:
    sys.path.insert(0, _bundle_dir)

# 프로젝트 루트도 추가 (backend 상위)
_project_root = os.path.dirname(_bundle_dir)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="SEO Creator Backend")
    parser.add_argument("--port", type=int, default=18484)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args = parser.parse_args()

    appdata = os.environ.get("SEO_CREATOR_APPDATA_DIR", "")
    print(f"[seo-backend] frozen={getattr(sys, 'frozen', False)}")
    print(f"[seo-backend] bundle_dir={_bundle_dir}")
    print(f"[seo-backend] sys.path[0]={sys.path[0]}")
    print(f"[seo-backend] APPDATA_DIR={appdata}")

    try:
        # 직접 app 객체를 import하여 전달 (문자열 import 방지)
        from backend.app.main import app
        print("[seo-backend] FastAPI app imported OK")
    except Exception as e:
        print(f"[seo-backend] FATAL: Failed to import app: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    try:
        import uvicorn
        print(f"[seo-backend] Starting uvicorn on {args.host}:{args.port}")
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    except Exception as e:
        print(f"[seo-backend] FATAL: uvicorn failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
