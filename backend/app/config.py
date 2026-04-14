import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


def _resolve_db_path() -> str:
    """writable한 DB 경로를 결정한다.

    우선순위:
    1. SEO_CREATOR_DB_PATH 환경변수 (절대경로)
    2. SEO_CREATOR_APPDATA_DIR / seo_creator.db
    3. 개발 모드 fallback: ./seo_creator.db
    """
    # 1. 명시적 DB 경로
    explicit = os.environ.get("SEO_CREATOR_DB_PATH")
    if explicit:
        parent = Path(explicit).parent
        parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{explicit}"

    # 2. Electron이 전달한 userData 경로
    appdata = os.environ.get("SEO_CREATOR_APPDATA_DIR")
    if appdata:
        db_dir = Path(appdata)
        db_dir.mkdir(parents=True, exist_ok=True)
        db_path = db_dir / "seo_creator.db"
        return f"sqlite+aiosqlite:///{db_path}"

    # 3. 개발 모드 fallback
    return "sqlite+aiosqlite:///./seo_creator.db"


class Settings(BaseSettings):
    youtube_api_key: str = ""
    unsplash_api_key: str = ""
    database_url: str = ""
    backend_port: int = 8000

    # Google Trends
    google_trends_mode: str = "off"
    google_cloud_project_id: str = ""
    google_application_credentials: str = ""
    trends_cache_ttl_hours: int = 24
    trends_region: str = "KR"
    trends_language: str = "ko"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.database_url:
            self.database_url = _resolve_db_path()


@lru_cache
def get_settings() -> Settings:
    return Settings()
