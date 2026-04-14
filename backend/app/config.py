from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    youtube_api_key: str = ""
    unsplash_api_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./seo_creator.db"
    backend_port: int = 8000

    # Google Trends
    google_trends_mode: str = "off"  # "off" | "mock" | "bigquery"
    google_cloud_project_id: str = ""
    google_application_credentials: str = ""
    trends_cache_ttl_hours: int = 24
    trends_region: str = "KR"
    trends_language: str = "ko"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
