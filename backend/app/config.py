from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    youtube_api_key: str = ""
    unsplash_api_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./seo_creator.db"
    backend_port: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
