"""
Trends Client – Google Trends 데이터 조회

모드:
- off: 아무것도 하지 않음 (빈 결과)
- mock: 내장 트렌드 데이터 반환 (데모/테스트용)
- bigquery: Google Trends BigQuery Public Dataset 조회

모든 모드에서 실패 시 빈 결과를 반환한다 (절대 예외 전파 안 함).
"""

import json
import logging
from pathlib import Path

from backend.app.config import get_settings
from backend.app.services.trends_cache import get_cached, set_cached

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


# ── 결과 형식 ──

class TrendsResult:
    """트렌드 조회 결과."""
    def __init__(
        self,
        seed: str,
        related_queries: list[dict] | None = None,
        source: str = "none",
        cached: bool = False,
    ):
        self.seed = seed
        self.related_queries = related_queries or []
        self.source = source
        self.cached = cached

    def to_dict(self) -> dict:
        return {
            "seed": self.seed,
            "related_queries": self.related_queries,
            "source": self.source,
            "cached": self.cached,
        }

    @property
    def is_empty(self) -> bool:
        return len(self.related_queries) == 0


# ── Seed Keyword 생성 ──

def generate_seed_keywords(
    genre: str,
    mood: str,
    situation: str,
    language: str,
    artists: list[str] | None = None,
) -> list[str]:
    """분석 결과로부터 seed keyword 3~5개 생성."""
    d: dict = {}
    dict_path = _DATA_DIR / "keyword_dictionary.json"
    if dict_path.exists():
        with open(dict_path, encoding="utf-8") as f:
            d = json.load(f)

    lv = d.get("language_variants", {})

    if language == "ko":
        g_disp = lv.get("ko", {}).get("genre_display", {}).get(genre, genre)
        m_disp = lv.get("ko", {}).get("mood_display", {}).get(mood, mood)
        s_disp = lv.get("ko", {}).get("situation_display", {}).get(situation, situation)
    else:
        g_disp = lv.get("en", {}).get("genre_display", {}).get(genre, genre)
        m_disp = mood
        s_disp = situation.replace("_", " ")

    seeds: list[str] = []

    if language == "ko":
        seeds.append(f"{s_disp} {g_disp}")
        seeds.append(f"{m_disp} {g_disp} 플레이리스트")
        seeds.append(f"{s_disp} 때 듣는 노래")
        if artists:
            seeds.append(f"{artists[0]} {g_disp}")
    else:
        seeds.append(f"{g_disp} {s_disp} playlist")
        seeds.append(f"{m_disp} {g_disp}")
        seeds.append(f"{g_disp} for {s_disp}")
        if artists:
            seeds.append(f"{artists[0]} {g_disp} mix")

    # 최대 5개
    return seeds[:5]


# ── Mock 데이터 ──

_MOCK_TRENDS: dict[str, list[dict]] = {
    # 운동 계열
    "운동": [
        {"keyword": "운동할때 듣는 노래", "score": 0.95, "type": "top"},
        {"keyword": "헬스장 노래 추천", "score": 0.90, "type": "rising"},
        {"keyword": "운동 플레이리스트 추천", "score": 0.87, "type": "top"},
        {"keyword": "런닝 음악 추천", "score": 0.82, "type": "rising"},
        {"keyword": "gym workout playlist", "score": 0.78, "type": "top"},
    ],
    "workout": [
        {"keyword": "workout playlist 2025", "score": 0.93, "type": "rising"},
        {"keyword": "gym motivation music", "score": 0.88, "type": "top"},
        {"keyword": "running playlist", "score": 0.85, "type": "top"},
        {"keyword": "workout mix kpop", "score": 0.80, "type": "rising"},
    ],
    # 케이팝 계열
    "케이팝": [
        {"keyword": "케이팝 플레이리스트", "score": 0.92, "type": "top"},
        {"keyword": "kpop 신곡 모음", "score": 0.88, "type": "rising"},
        {"keyword": "아이돌 노래 모음", "score": 0.84, "type": "top"},
        {"keyword": "2025 케이팝 히트곡", "score": 0.81, "type": "rising"},
    ],
    "kpop": [
        {"keyword": "kpop playlist 2025", "score": 0.94, "type": "rising"},
        {"keyword": "best kpop songs", "score": 0.89, "type": "top"},
        {"keyword": "kpop workout", "score": 0.83, "type": "top"},
        {"keyword": "new kpop releases", "score": 0.79, "type": "rising"},
    ],
    # 드라이브 계열
    "드라이브": [
        {"keyword": "드라이브 노래 추천", "score": 0.94, "type": "top"},
        {"keyword": "밤 드라이브 플레이리스트", "score": 0.91, "type": "rising"},
        {"keyword": "야간 드라이브 음악", "score": 0.86, "type": "top"},
        {"keyword": "고속도로 노래", "score": 0.80, "type": "rising"},
    ],
    "night drive": [
        {"keyword": "late night drive playlist", "score": 0.92, "type": "top"},
        {"keyword": "midnight drive music", "score": 0.88, "type": "rising"},
        {"keyword": "driving at night songs", "score": 0.84, "type": "top"},
    ],
    # 카페 계열
    "카페": [
        {"keyword": "카페 음악 모음", "score": 0.93, "type": "top"},
        {"keyword": "카페에서 듣기 좋은 노래", "score": 0.90, "type": "rising"},
        {"keyword": "카페 bgm 재즈", "score": 0.85, "type": "top"},
        {"keyword": "감성 카페 음악", "score": 0.82, "type": "top"},
    ],
    # 새벽/감성 계열
    "새벽": [
        {"keyword": "새벽 감성 노래", "score": 0.94, "type": "top"},
        {"keyword": "새벽에 듣기 좋은 노래", "score": 0.91, "type": "rising"},
        {"keyword": "밤에 듣는 팝송", "score": 0.87, "type": "top"},
        {"keyword": "새벽 감성 플레이리스트", "score": 0.83, "type": "rising"},
    ],
    # 공부 계열
    "공부": [
        {"keyword": "공부할때 듣는 음악", "score": 0.96, "type": "top"},
        {"keyword": "집중력 높이는 음악", "score": 0.92, "type": "rising"},
        {"keyword": "공부 브금 로파이", "score": 0.88, "type": "top"},
        {"keyword": "시험기간 플레이리스트", "score": 0.84, "type": "rising"},
    ],
    # 로파이 계열
    "로파이": [
        {"keyword": "로파이 비트 모음", "score": 0.93, "type": "top"},
        {"keyword": "lofi 공부 음악", "score": 0.90, "type": "rising"},
        {"keyword": "로파이 힙합 플레이리스트", "score": 0.86, "type": "top"},
        {"keyword": "카페 로파이 bgm", "score": 0.83, "type": "rising"},
    ],
    "lofi": [
        {"keyword": "lofi hip hop radio", "score": 0.95, "type": "top"},
        {"keyword": "lofi beats to study", "score": 0.92, "type": "rising"},
        {"keyword": "lofi chill playlist", "score": 0.88, "type": "top"},
        {"keyword": "lofi cafe music", "score": 0.84, "type": "top"},
    ],
    # 알앤비 계열
    "알앤비": [
        {"keyword": "감성 알앤비 모음", "score": 0.92, "type": "top"},
        {"keyword": "한국 알앤비 추천", "score": 0.88, "type": "rising"},
        {"keyword": "야간 알앤비 플리", "score": 0.84, "type": "top"},
    ],
    "rnb": [
        {"keyword": "r&b playlist 2025", "score": 0.91, "type": "rising"},
        {"keyword": "late night r&b", "score": 0.87, "type": "top"},
        {"keyword": "chill rnb mix", "score": 0.83, "type": "top"},
    ],
    # 팝 계열
    "팝": [
        {"keyword": "팝송 추천 2025", "score": 0.93, "type": "rising"},
        {"keyword": "감성 팝송 모음", "score": 0.89, "type": "top"},
        {"keyword": "인기 팝송 플레이리스트", "score": 0.86, "type": "top"},
        {"keyword": "새벽 팝송", "score": 0.82, "type": "rising"},
    ],
    "pop": [
        {"keyword": "pop playlist 2025", "score": 0.94, "type": "rising"},
        {"keyword": "best pop songs", "score": 0.90, "type": "top"},
        {"keyword": "pop hits playlist", "score": 0.87, "type": "top"},
        {"keyword": "chill pop mix", "score": 0.83, "type": "top"},
    ],
}


def _query_mock(seed: str) -> list[dict]:
    """seed 키워드와 부분 일치하는 mock 결과를 합산."""
    results: list[dict] = []
    seen: set[str] = set()

    for mock_key, mock_items in _MOCK_TRENDS.items():
        if mock_key in seed.lower() or seed.lower() in mock_key:
            for item in mock_items:
                if item["keyword"] not in seen:
                    results.append(item)
                    seen.add(item["keyword"])

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:8]


# ── BigQuery 조회 ──

def _query_bigquery(seed: str, region: str, language: str) -> list[dict]:
    """Google Trends BigQuery Public Dataset 조회."""
    try:
        from google.cloud import bigquery

        settings = get_settings()
        client = bigquery.Client(project=settings.google_cloud_project_id)

        # Google Trends international dataset: `bigquery-public-data.google_trends.international_top_terms`
        query = """
        SELECT term, score, rank, refresh_date
        FROM `bigquery-public-data.google_trends.international_top_terms`
        WHERE country_code = @region
          AND LOWER(term) LIKE CONCAT('%', LOWER(@seed), '%')
          AND refresh_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        ORDER BY score DESC
        LIMIT 10
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("region", "STRING", region),
                bigquery.ScalarQueryParameter("seed", "STRING", seed),
            ]
        )

        result = client.query(query, job_config=job_config).result()
        queries: list[dict] = []
        for row in result:
            queries.append({
                "keyword": row.term,
                "score": min(1.0, row.score / 100.0) if row.score else 0.5,
                "type": "top",
            })

        return queries

    except ImportError:
        logger.warning("google-cloud-bigquery not installed, falling back to empty")
        return []
    except Exception as e:
        logger.warning(f"BigQuery query failed for seed '{seed}': {e}")
        return []


# ── 공개 API ──

def query_trends(seed: str, region: str | None = None, language: str | None = None) -> TrendsResult:
    """seed 키워드로 트렌드 데이터를 조회한다.

    모든 모드에서 실패 시 빈 TrendsResult를 반환한다.
    """
    settings = get_settings()
    mode = settings.google_trends_mode.lower()
    region = region or settings.trends_region
    language = language or settings.trends_language

    if mode == "off":
        return TrendsResult(seed=seed, source="off")

    # 캐시 확인
    cached_data = get_cached(seed, region, language)
    if cached_data is not None:
        return TrendsResult(
            seed=seed,
            related_queries=cached_data.get("related_queries", []),
            source=cached_data.get("source", "cache"),
            cached=True,
        )

    # 모드별 조회
    try:
        if mode == "mock":
            queries = _query_mock(seed)
            source = "mock_trends"
        elif mode == "bigquery":
            queries = _query_bigquery(seed, region, language)
            source = "google_trends_bigquery"
        else:
            return TrendsResult(seed=seed, source="off")

        result = TrendsResult(seed=seed, related_queries=queries, source=source)

        # 캐시 저장
        if queries:
            set_cached(seed, region, language, result.to_dict())

        return result

    except Exception as e:
        logger.error(f"Trends query failed for '{seed}': {e}")
        return TrendsResult(seed=seed, source="error_fallback")


def query_trends_multi(seeds: list[str], region: str | None = None, language: str | None = None) -> list[TrendsResult]:
    """여러 seed에 대해 트렌드를 조회하고 합산 결과를 반환."""
    results: list[TrendsResult] = []
    for seed in seeds:
        results.append(query_trends(seed, region, language))
    return results
