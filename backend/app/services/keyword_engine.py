"""
SEO 키워드 추론 엔진 + SEO 점수 산정

기능:
- 분석 결과 기반 SEO 키워드 생성
- 장르/상황 조합 키워드 생성
- 한국어/영어 병행 생성
- 키워드별 SEO 점수 산정
"""

import json
from pathlib import Path
from itertools import product as iter_product

from backend.app.models.schemas import (
    AnalysisResult,
    KeywordScore,
    Language,
)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_dict_cache: dict | None = None


def _load_dictionary() -> dict:
    global _dict_cache
    if _dict_cache is None:
        with open(_DATA_DIR / "keyword_dictionary.json", encoding="utf-8") as f:
            _dict_cache = json.load(f)
    return _dict_cache


# ── 키워드 수집 ──


def _collect_genre_keywords(genre: str, lang: str) -> list[str]:
    d = _load_dictionary()
    entry = d.get("genres", {}).get(genre, {})
    if lang == "en":
        return entry.get("en_keywords", [])
    return entry.get("ko_keywords", [])


def _collect_mood_keywords(mood: str, lang: str) -> list[str]:
    d = _load_dictionary()
    entry = d.get("moods", {}).get(mood, {})
    if lang == "en":
        return entry.get("en_keywords", [])
    return entry.get("ko_keywords", [])


def _collect_situation_keywords(situation: str, lang: str) -> list[str]:
    d = _load_dictionary()
    entry = d.get("situations", {}).get(situation, {})
    if lang == "en":
        return entry.get("en_keywords", [])
    return entry.get("ko_keywords", [])


def collect_keywords(analysis: AnalysisResult) -> list[str]:
    """분석 결과에서 모든 관련 키워드를 수집한다."""
    lang = analysis.language
    keywords: list[str] = []

    for g in analysis.detected_genres:
        keywords.extend(_collect_genre_keywords(g, lang))
    for m in analysis.detected_moods:
        keywords.extend(_collect_mood_keywords(m, lang))
    for s in analysis.detected_situations:
        keywords.extend(_collect_situation_keywords(s, lang))

    # 아티스트 이름도 키워드로 포함
    keywords.extend(analysis.top_artists[:3])

    # keyword_pool 에서 추가
    keywords.extend(analysis.keyword_pool)

    # 중복 제거 (순서 유지)
    seen: set[str] = set()
    unique: list[str] = []
    for kw in keywords:
        low = kw.lower().strip()
        if low and low not in seen:
            seen.add(low)
            unique.append(kw.strip())
    return unique


# ── 조합 키워드 생성 ──


def generate_combination_keywords(analysis: AnalysisResult) -> list[str]:
    """장르 + 상황, 분위기 + 장르 등 조합 키워드를 만든다."""
    lang = analysis.language
    combos: list[str] = []

    genre_kw = _collect_genre_keywords(analysis.primary_genre, lang)[:3]
    mood_kw = _collect_mood_keywords(analysis.primary_mood, lang)[:3]
    sit_kw = _collect_situation_keywords(analysis.primary_situation, lang)[:3]

    # 2종 조합
    for g, m in iter_product(genre_kw[:2], mood_kw[:2]):
        combos.append(f"{m} {g}")
    for g, s in iter_product(genre_kw[:2], sit_kw[:2]):
        combos.append(f"{s} {g}")
    for m, s in iter_product(mood_kw[:2], sit_kw[:2]):
        combos.append(f"{s} {m}")

    return list(dict.fromkeys(combos))  # 중복 제거


# ── 롱테일 키워드 ──


def generate_longtail_keywords(analysis: AnalysisResult) -> list[str]:
    """긴 꼬리 검색어 생성 (자연어형)."""
    lang = analysis.language
    genre = analysis.primary_genre
    mood = analysis.primary_mood
    situation = analysis.primary_situation

    g_kw = _collect_genre_keywords(genre, lang)
    m_kw = _collect_mood_keywords(mood, lang)
    s_kw = _collect_situation_keywords(situation, lang)

    g = g_kw[0] if g_kw else genre
    m = m_kw[0] if m_kw else mood
    s = s_kw[0] if s_kw else situation

    if lang == "ko":
        templates = [
            f"{s} 때 듣기 좋은 {g}",
            f"{m} {g} 플레이리스트",
            f"{s} {m} {g} 모음",
            f"{m} 느낌의 {g} 노래",
            f"{s} 분위기 {g}",
        ]
    else:
        templates = [
            f"{m} {g} for {s}",
            f"best {m} {g} playlist",
            f"{g} songs for {s}",
            f"{m} {g} mix",
            f"{s} vibes {g}",
        ]
    return templates


# ── SEO 점수 산정 ──


def _relevance_score(keyword: str, analysis: AnalysisResult) -> float:
    """키워드가 분석 결과와 얼마나 관련 있는지 0~1 점수."""
    low = keyword.lower()
    score = 0.0
    pool_lower = [k.lower() for k in analysis.keyword_pool]

    if low in pool_lower:
        score += 0.4
    # 장르/무드/상황 직접 언급
    if analysis.primary_genre.lower() in low:
        score += 0.2
    if analysis.primary_mood.lower() in low:
        score += 0.2
    if analysis.primary_situation.replace("_", " ").lower() in low:
        score += 0.2
    return min(score, 1.0)


def _search_intent_score(keyword: str) -> float:
    """검색 의도 적합도 – 키워드 길이·구성으로 추정."""
    words = keyword.split()
    if len(words) < 2:
        return 0.3
    if len(words) <= 4:
        return 0.8
    return 0.6  # 너무 길면 약간 감소


def _spam_risk(keyword: str) -> float:
    """낚시/과장 위험도."""
    spam_words = [
        "미쳤", "ㄹㅇ", "실화", "레전드", "충격", "극혐", "개쩌는",
        "insane", "shocking", "crazy", "you won't believe",
    ]
    low = keyword.lower()
    for w in spam_words:
        if w in low:
            return 0.8
    return 0.0


def score_keyword(keyword: str, analysis: AnalysisResult) -> KeywordScore:
    """개별 키워드 SEO 점수를 산정한다."""
    relevance = _relevance_score(keyword, analysis)
    search_intent = _search_intent_score(keyword)

    # 무드/장르 매치는 relevance 에 포함되므로 별도 가중
    mood_match = 0.0
    genre_match = 0.0
    low = keyword.lower()
    for m in analysis.detected_moods:
        if m.lower() in low:
            mood_match = 1.0
            break
    for g in analysis.detected_genres:
        if g.lower() in low:
            genre_match = 1.0
            break
    if mood_match == 0.0:
        mood_match = 0.3 if relevance > 0.3 else 0.1
    if genre_match == 0.0:
        genre_match = 0.3 if relevance > 0.3 else 0.1

    spam = _spam_risk(keyword)

    total = (
        relevance * 0.30
        + search_intent * 0.25
        + mood_match * 0.15
        + genre_match * 0.15
        - spam * 0.15
    )
    total = max(0.0, min(1.0, total))

    return KeywordScore(
        keyword=keyword,
        relevance=round(relevance, 3),
        search_intent=round(search_intent, 3),
        mood_match=round(mood_match, 3),
        genre_match=round(genre_match, 3),
        spam_risk=round(spam, 3),
        total_score=round(total, 3),
    )


def score_all_keywords(
    keywords: list[str], analysis: AnalysisResult
) -> list[KeywordScore]:
    """키워드 목록 전체를 점수화하고 높은 순으로 정렬한다."""
    scored = [score_keyword(kw, analysis) for kw in keywords]
    scored.sort(key=lambda s: s.total_score, reverse=True)
    return scored
