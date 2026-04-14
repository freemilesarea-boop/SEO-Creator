"""
Trends Cache – SQLite 파일 기반 캐시

조회 결과를 로컬에 저장하여 동일 seed 재요청 시 외부 호출을 건너뛴다.
TTL 기본 24시간.
"""

import json
import sqlite3
import time
from pathlib import Path

from backend.app.config import get_settings

_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "trends_cache.db"
_conn: sqlite3.Connection | None = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
        _conn.execute("""
            CREATE TABLE IF NOT EXISTS trends_cache (
                seed       TEXT PRIMARY KEY,
                region     TEXT,
                language   TEXT,
                data       TEXT,
                created_at REAL
            )
        """)
        _conn.commit()
    return _conn


def get_cached(seed: str, region: str, language: str) -> dict | None:
    """캐시에서 결과를 가져온다. TTL 초과 시 None."""
    conn = _get_conn()
    ttl_seconds = get_settings().trends_cache_ttl_hours * 3600
    cutoff = time.time() - ttl_seconds

    row = conn.execute(
        "SELECT data, created_at FROM trends_cache WHERE seed=? AND region=? AND language=?",
        (seed, region, language),
    ).fetchone()

    if row is None:
        return None
    data_str, created_at = row
    if created_at < cutoff:
        # 만료됨
        conn.execute(
            "DELETE FROM trends_cache WHERE seed=? AND region=? AND language=?",
            (seed, region, language),
        )
        conn.commit()
        return None

    return json.loads(data_str)


def set_cached(seed: str, region: str, language: str, data: dict) -> None:
    """캐시에 저장."""
    conn = _get_conn()
    conn.execute(
        """INSERT OR REPLACE INTO trends_cache (seed, region, language, data, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (seed, region, language, json.dumps(data, ensure_ascii=False), time.time()),
    )
    conn.commit()


def clear_expired() -> int:
    """만료된 캐시 항목 정리. 삭제 건수 반환."""
    conn = _get_conn()
    ttl_seconds = get_settings().trends_cache_ttl_hours * 3600
    cutoff = time.time() - ttl_seconds
    cursor = conn.execute("DELETE FROM trends_cache WHERE created_at < ?", (cutoff,))
    conn.commit()
    return cursor.rowcount
