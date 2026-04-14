"""
Trends Ranker – 기존 keyword_engine 점수와 Trends 점수를 병합하여 재점수화

final_score =
  (internal_relevance * 0.45) +
  (trend_score * 0.35) +
  (situation_match * 0.10) +
  (genre_match * 0.10)
"""

import logging

from backend.app.models.schemas import AnalysisResult, KeywordScore
from backend.app.services.trends_client import (
    TrendsResult,
    generate_seed_keywords,
    query_trends_multi,
)
from backend.app.services.keyword_engine import score_keyword

logger = logging.getLogger(__name__)


# ── 낚시/부적합 키워드 필터 ──

_SPAM_FRAGMENTS = {
    "미쳤", "ㄹㅇ", "실화", "레전드", "충격", "극혐", "개쩌는",
    "insane", "shocking", "you won't believe", "gone wrong",
    "clickbait", "exposed", "leaked",
}


def _is_spam(keyword: str) -> bool:
    low = keyword.lower()
    return any(s in low for s in _SPAM_FRAGMENTS)


def _brevity_bonus(keyword: str) -> float:
    """짧고 명확한 키워드에 가산점. 제목 앞부분에 넣기 좋은 길이."""
    words = keyword.split()
    if 2 <= len(words) <= 4:
        return 0.08
    if len(words) == 1 and len(keyword) <= 10:
        return 0.04
    return 0.0


def _rising_bonus(query_type: str) -> float:
    """rising 검색어에 가산점."""
    return 0.06 if query_type == "rising" else 0.0


# ── 핵심: Trends 강화 재점수화 ──


def enhance_with_trends(
    analysis: AnalysisResult,
    existing_scores: list[KeywordScore],
    language: str,
) -> tuple[list[KeywordScore], dict]:
    """기존 키워드 점수에 Trends 데이터를 병합하여 재점수화.

    Returns:
        (enhanced_scores, trend_meta)
        trend_meta: {"trend_enhanced": bool, "trends_source": str,
                     "trend_keywords": [...], "trend_cache_hit": bool}
    """
    # 1) seed 키워드 생성
    seeds = generate_seed_keywords(
        genre=analysis.primary_genre,
        mood=analysis.primary_mood,
        situation=analysis.primary_situation,
        language=language,
        artists=analysis.top_artists[:2],
    )

    # 2) Trends 조회
    trends_results = query_trends_multi(seeds, language=language)

    # 3) 결과 병합
    all_trend_queries: list[dict] = []
    source = "off"
    any_cached = False
    any_data = False

    for tr in trends_results:
        if not tr.is_empty:
            any_data = True
            source = tr.source
            if tr.cached:
                any_cached = True
            all_trend_queries.extend(tr.related_queries)

    # 중복 제거
    seen: set[str] = set()
    unique_trends: list[dict] = []
    for q in all_trend_queries:
        kw = q["keyword"]
        if kw.lower() not in seen and not _is_spam(kw):
            seen.add(kw.lower())
            unique_trends.append(q)

    # 상위 15개로 제한
    unique_trends.sort(key=lambda x: x.get("score", 0), reverse=True)
    unique_trends = unique_trends[:15]

    if not any_data:
        # Trends 데이터 없음 → 기존 결과 그대로 반환
        return existing_scores, {
            "trend_enhanced": False,
            "trends_source": source,
            "trend_keywords": [],
            "trend_cache_hit": False,
        }

    # 4) trend 키워드를 KeywordScore로 변환하고 기존 결과와 병합
    trend_kw_map: dict[str, float] = {}
    trend_type_map: dict[str, str] = {}
    for q in unique_trends:
        trend_kw_map[q["keyword"].lower()] = q.get("score", 0.5)
        trend_type_map[q["keyword"].lower()] = q.get("type", "top")

    # 기존 키워드 재점수화
    enhanced: list[KeywordScore] = []
    existing_kw_set: set[str] = set()

    for ks in existing_scores:
        existing_kw_set.add(ks.keyword.lower())
        trend_score = trend_kw_map.get(ks.keyword.lower(), 0.0)
        query_type = trend_type_map.get(ks.keyword.lower(), "none")

        # 병합 공식
        new_total = (
            ks.relevance * 0.45
            + trend_score * 0.35
            + ks.mood_match * 0.10
            + ks.genre_match * 0.10
            + _rising_bonus(query_type)
            + _brevity_bonus(ks.keyword)
        )
        new_total = max(0.0, min(1.0, new_total))

        enhanced.append(KeywordScore(
            keyword=ks.keyword,
            relevance=ks.relevance,
            search_intent=round(max(ks.search_intent, trend_score), 3),
            mood_match=ks.mood_match,
            genre_match=ks.genre_match,
            spam_risk=ks.spam_risk,
            total_score=round(new_total, 3),
        ))

    # 새로운 trend 키워드 추가 (기존에 없던 것)
    for q in unique_trends:
        kw_lower = q["keyword"].lower()
        if kw_lower not in existing_kw_set:
            trend_score = q.get("score", 0.5)
            query_type = q.get("type", "top")

            # 기본 internal score 산정
            base_ks = score_keyword(q["keyword"], analysis)

            new_total = (
                base_ks.relevance * 0.45
                + trend_score * 0.35
                + base_ks.mood_match * 0.10
                + base_ks.genre_match * 0.10
                + _rising_bonus(query_type)
                + _brevity_bonus(q["keyword"])
            )
            new_total = max(0.0, min(1.0, new_total))

            enhanced.append(KeywordScore(
                keyword=q["keyword"],
                relevance=base_ks.relevance,
                search_intent=round(trend_score, 3),
                mood_match=base_ks.mood_match,
                genre_match=base_ks.genre_match,
                spam_risk=base_ks.spam_risk,
                total_score=round(new_total, 3),
            ))

    # 최종 정렬
    enhanced.sort(key=lambda x: x.total_score, reverse=True)

    trend_meta = {
        "trend_enhanced": True,
        "trends_source": source,
        "trend_keywords": [q["keyword"] for q in unique_trends[:10]],
        "trend_cache_hit": any_cached,
    }

    return enhanced, trend_meta
