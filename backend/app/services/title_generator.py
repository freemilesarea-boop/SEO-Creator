"""
제목 생성 엔진

출력:
1) YouTube Music 제목 – 2~5어절, 짧고 검색 친화적, 과장 금지
2) YouTube Playlist 제목 – 12~35자+, 장르+감성+상황+키워드 결합, 자연어 문장형
"""

import json
import random
from pathlib import Path

from backend.app.models.schemas import AnalysisResult, KeywordScore, Language
from backend.app.services.coherence import (
    pick_compatible_mood,
    is_title_consistent,
)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_dict_cache: dict | None = None


def _load_dictionary() -> dict:
    global _dict_cache
    if _dict_cache is None:
        with open(_DATA_DIR / "keyword_dictionary.json", encoding="utf-8") as f:
            _dict_cache = json.load(f)
    return _dict_cache


def _pick_display_keyword(key: str, section: str, lang: str) -> str:
    """사전에서 사람이 읽기 좋은 대표 키워드 1개를 꺼낸다."""
    d = _load_dictionary()

    # language_variants 에 display 이름이 있으면 우선 사용
    display_section = {
        "genres": "genre_display",
        "moods": "mood_display",
        "situations": "situation_display",
    }.get(section)
    if display_section:
        display_map = (
            d.get("language_variants", {}).get(lang, {}).get(display_section, {})
        )
        if key in display_map:
            return display_map[key]

    entry = d.get(section, {}).get(key, {})
    pool = entry.get("ko_keywords" if lang == "ko" else "en_keywords", [])
    if pool:
        return pool[0]
    return key.replace("_", " ")


# ── YouTube Music 제목 (짧은 형태) ──


_YTM_KO_PATTERNS = [
    "{situation} {genre}",
    "{mood} {genre}",
    "{mood} {situation} {genre}",
    "{situation} {mood} 음악",
    "{mood} {genre} 모음",
    "{situation} 감성 {genre}",
    "{mood} 느낌 {genre}",
    "{genre} {situation} 믹스",
]

_YTM_EN_PATTERNS = [
    "{mood} {genre}",
    "{situation} {genre}",
    "{mood} {genre} mix",
    "{situation} {mood} {genre}",
    "{genre} for {situation}",
    "{mood} {genre} vibes",
    "{situation} {genre} beats",
    "{mood} {situation} music",
]


def _generate_ytm_titles(
    analysis: AnalysisResult, lang: str, count: int = 6
) -> list[str]:
    genre = _pick_display_keyword(analysis.primary_genre, "genres", lang)
    # situation-first: situation과 호환되는 mood 선택
    compatible_mood = pick_compatible_mood(
        analysis.primary_situation, analysis.detected_moods
    )
    mood = _pick_display_keyword(compatible_mood, "moods", lang)
    situation = _pick_display_keyword(analysis.primary_situation, "situations", lang)

    patterns = _YTM_KO_PATTERNS if lang == "ko" else _YTM_EN_PATTERNS
    titles: list[str] = []

    for pat in patterns:
        title = pat.format(genre=genre, mood=mood, situation=situation)
        titles.append(title.strip())

    # 사전 템플릿도 활용
    d = _load_dictionary()
    templates = (
        d.get("title_templates", {}).get("yt_music", {}).get("ko" if lang == "ko" else "en", [])
    )
    for tmpl in templates[:10]:
        try:
            title = tmpl.format(
                genre=genre, mood=mood, situation=situation, keyword=genre
            )
            if title not in titles:
                titles.append(title.strip())
        except (KeyError, IndexError):
            continue

    # 중복 제거 + consistency filter
    seen: set[str] = set()
    unique: list[str] = []
    for t in titles:
        if t.lower() not in seen and is_title_consistent(analysis.primary_situation, t):
            seen.add(t.lower())
            unique.append(t)
    random.shuffle(unique)
    return unique[:count]


# ── YouTube Playlist 제목 (긴 형태) ──


_YTP_KO_PATTERNS = [
    "{situation}에 듣기 좋은 {mood} {genre} 플레이리스트",
    "{situation} 때 분위기 살려주는 {mood} {genre} 모음",
    "{mood} 감성의 {genre} 노래 모음 | {situation}용",
    "{situation} 분위기에 어울리는 {mood} {genre} 플레이리스트",
    "{mood} 느낌 가득한 {genre} 플레이리스트 | {situation}",
    "듣기만 해도 좋은 {mood} {genre} 모음 | {situation}",
    "{situation} {mood} {genre} 플레이리스트 추천",
    "{mood} 분위기의 {genre} 모음 | {situation} 추천 플레이리스트",
    "{situation}할 때 빠져드는 {mood} {genre} 노래 모음",
    "{genre} 좋아한다면 꼭 들어야 할 {mood} 플레이리스트",
]

_YTP_EN_PATTERNS = [
    "{mood} {genre} playlist for {situation}",
    "best {mood} {genre} songs for {situation}",
    "{mood} {genre} mix | perfect for {situation}",
    "{situation} vibes – {mood} {genre} playlist",
    "the ultimate {mood} {genre} playlist | {situation} edition",
    "{mood} {genre} collection for your {situation} moments",
    "{genre} songs that feel {mood} | {situation} playlist",
    "{situation} mood – curated {mood} {genre} mix",
    "feel the {mood} vibes | {genre} playlist for {situation}",
    "top {mood} {genre} tracks for {situation}",
]


def _generate_ytp_titles(
    analysis: AnalysisResult, lang: str, count: int = 6
) -> list[str]:
    genre = _pick_display_keyword(analysis.primary_genre, "genres", lang)
    compatible_mood = pick_compatible_mood(
        analysis.primary_situation, analysis.detected_moods
    )
    mood = _pick_display_keyword(compatible_mood, "moods", lang)
    situation = _pick_display_keyword(analysis.primary_situation, "situations", lang)

    patterns = _YTP_KO_PATTERNS if lang == "ko" else _YTP_EN_PATTERNS
    titles: list[str] = []

    for pat in patterns:
        title = pat.format(genre=genre, mood=mood, situation=situation)
        titles.append(title.strip())

    # 사전 템플릿 활용
    d = _load_dictionary()
    templates = (
        d.get("title_templates", {}).get("yt_playlist", {}).get("ko" if lang == "ko" else "en", [])
    )
    for tmpl in templates[:10]:
        try:
            title = tmpl.format(
                genre=genre, mood=mood, situation=situation, keyword=genre
            )
            if title not in titles:
                titles.append(title.strip())
        except (KeyError, IndexError):
            continue

    seen: set[str] = set()
    unique: list[str] = []
    for t in titles:
        if t.lower() not in seen and is_title_consistent(analysis.primary_situation, t):
            seen.add(t.lower())
            unique.append(t)
    random.shuffle(unique)
    return unique[:count]


# ── 3세트 이상 결과 생성 ──


def _generate_trend_titles(
    analysis: AnalysisResult,
    keyword_scores: list[KeywordScore],
    language: str,
) -> tuple[str, str]:
    """Trend 키워드 기반 제목 쌍(YTM, YTP)을 생성.
    search_intent가 높은 키워드를 제목 앞부분에 배치."""
    # search_intent 기준 상위 키워드 (trend 반영된 것)
    top_kws = sorted(keyword_scores, key=lambda k: k.search_intent, reverse=True)
    trend_kws = [k.keyword for k in top_kws if k.search_intent >= 0.7][:3]

    if not trend_kws:
        return "", ""

    d = _load_dictionary()
    genre = _pick_display_keyword(analysis.primary_genre, "genres", language)

    genre_lower = genre.lower()

    if language == "ko":
        ytm = trend_kws[0] if len(trend_kws[0].split()) <= 5 else trend_kws[0][:20]
        # genre가 이미 키워드에 포함되면 중복 방지
        if genre_lower in trend_kws[0].lower():
            ytp = f"{trend_kws[0]} 플레이리스트"
        else:
            ytp = f"{trend_kws[0]} | {genre} 플레이리스트"
        if len(trend_kws) > 1:
            kw2 = trend_kws[1]
            if genre_lower in kw2.lower():
                ytp = f"{trend_kws[0]} | {kw2}"
            else:
                ytp = f"{trend_kws[0]} | {kw2}"
    else:
        ytm = trend_kws[0]
        if genre_lower in trend_kws[0].lower():
            ytp = f"{trend_kws[0]} playlist"
        else:
            ytp = f"{trend_kws[0]} | {genre} playlist"
        if len(trend_kws) > 1:
            kw2 = trend_kws[1]
            if genre_lower in kw2.lower():
                ytp = f"{trend_kws[0]} – {kw2}"
            else:
                ytp = f"{trend_kws[0]} – {kw2} {genre} mix"

    # consistency check
    if not is_title_consistent(analysis.primary_situation, ytm):
        ytm = ""
    if not is_title_consistent(analysis.primary_situation, ytp):
        ytp = ""

    return ytm, ytp


def generate_title_sets(
    analysis: AnalysisResult,
    keyword_scores: list[KeywordScore],
    language: str = "ko",
) -> list[dict]:
    """
    최소 3세트의 제목 조합을 생성한다.

    세트 유형:
    - 감성형: 분위기·감성 키워드 강조
    - 검색형: SEO 검색 키워드 강조 (trend 키워드 우선)
    - 클릭형: 클릭 유도 자연어형
    """
    ytm_pool = _generate_ytm_titles(analysis, language, count=9)
    ytp_pool = _generate_ytp_titles(analysis, language, count=9)

    # Trend 기반 제목 생성 (검색형 세트에 사용)
    trend_ytm, trend_ytp = _generate_trend_titles(
        analysis, keyword_scores, language
    )

    # 풀이 부족하면 채움
    while len(ytm_pool) < 3:
        ytm_pool.append(ytm_pool[0] if ytm_pool else "플레이리스트")
    while len(ytp_pool) < 3:
        ytp_pool.append(ytp_pool[0] if ytp_pool else "플레이리스트 모음")

    set_labels = [
        ("감성형", "Emotional") if language == "ko" else ("Emotional", "Emotional"),
        ("검색형", "Search-Optimized") if language == "ko" else ("Search-Optimized", "Search-Optimized"),
        ("클릭형", "Click-Optimized") if language == "ko" else ("Click-Optimized", "Click-Optimized"),
    ]

    results: list[dict] = []
    for i, (label_ko, _label_en) in enumerate(set_labels):
        ytm = ytm_pool[i] if i < len(ytm_pool) else ytm_pool[-1]
        ytp = ytp_pool[i] if i < len(ytp_pool) else ytp_pool[-1]

        # 검색형 세트에 trend 제목 우선 적용
        if i == 1:  # 검색형
            if trend_ytm:
                ytm = trend_ytm
            if trend_ytp:
                ytp = trend_ytp

        results.append({
            "set_label": label_ko,
            "yt_music_title": ytm,
            "yt_playlist_title": ytp,
        })

    return results
