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
from backend.app.services.keyword_engine import classify_keyword

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


def _pick_by_type(
    keyword_scores: list[KeywordScore],
    target_type: str,
    situation: str,
    count: int = 3,
) -> list[str]:
    """특정 keyword type의 키워드를 점수 순으로 추출."""
    candidates = [
        ks for ks in keyword_scores
        if classify_keyword(ks.keyword) == target_type
        and is_title_consistent(situation, ks.keyword)
    ]
    candidates.sort(key=lambda k: k.total_score, reverse=True)
    return [c.keyword for c in candidates[:count]]


def _make_title_pair(
    kws: list[str],
    genre: str,
    language: str,
    situation: str,
) -> tuple[str, str]:
    """키워드 리스트로부터 YTM/YTP 제목 쌍을 만든다."""
    if not kws:
        return "", ""

    genre_lower = genre.lower()
    ytm = kws[0]

    if genre_lower in kws[0].lower():
        ytp = f"{kws[0]} 플레이리스트" if language == "ko" else f"{kws[0]} playlist"
    else:
        ytp = f"{kws[0]} | {genre} 플레이리스트" if language == "ko" else f"{kws[0]} | {genre} playlist"

    if len(kws) > 1:
        ytp = f"{kws[0]} | {kws[1]}"

    if not is_title_consistent(situation, ytm):
        ytm = ""
    if not is_title_consistent(situation, ytp):
        ytp = ""
    return ytm, ytp


def generate_title_sets(
    analysis: AnalysisResult,
    keyword_scores: list[KeywordScore],
    language: str = "ko",
) -> list[dict]:
    """
    3세트 제목 생성:
    - 감성형: 분위기·감성 키워드 (template 기반)
    - 검색형: mid-tail 키워드 우선 (trend 반영)
    - 롱테일형: long-tail 키워드 (low competition)
    """
    ytm_pool = _generate_ytm_titles(analysis, language, count=9)
    ytp_pool = _generate_ytp_titles(analysis, language, count=9)

    genre = _pick_display_keyword(analysis.primary_genre, "genres", language)
    situation = analysis.primary_situation

    # mid-tail 제목 (검색형)
    mid_kws = _pick_by_type(keyword_scores, "mid-tail", situation, 3)
    if not mid_kws:
        # fallback: non-head 키워드
        non_head = [
            ks for ks in sorted(keyword_scores, key=lambda k: k.total_score, reverse=True)
            if classify_keyword(ks.keyword) != "head"
            and is_title_consistent(situation, ks.keyword)
        ]
        mid_kws = [k.keyword for k in non_head[:3]]
    mid_ytm, mid_ytp = _make_title_pair(mid_kws, genre, language, situation)

    # long-tail 제목 (롱테일형)
    long_kws = _pick_by_type(keyword_scores, "long-tail", situation, 3)
    if not long_kws:
        all_sorted = sorted(keyword_scores, key=lambda k: len(k.keyword), reverse=True)
        long_kws = [
            k.keyword for k in all_sorted
            if classify_keyword(k.keyword) != "head"
            and is_title_consistent(situation, k.keyword)
        ][:3]
    long_ytm, long_ytp = _make_title_pair(long_kws, genre, language, situation)

    # 풀이 부족하면 채움
    while len(ytm_pool) < 3:
        ytm_pool.append(ytm_pool[0] if ytm_pool else "플레이리스트")
    while len(ytp_pool) < 3:
        ytp_pool.append(ytp_pool[0] if ytp_pool else "플레이리스트 모음")

    set_labels_ko = ["감성형", "검색형", "롱테일형"]
    set_labels_en = ["Emotional", "Search-Optimized", "Long-Tail"]
    labels = set_labels_ko if language == "ko" else set_labels_en

    results: list[dict] = []

    # 1번: 감성형 (template 기반)
    results.append({
        "set_label": labels[0],
        "yt_music_title": ytm_pool[0],
        "yt_playlist_title": ytp_pool[0],
    })

    # 2번: 검색형 (mid-tail)
    results.append({
        "set_label": labels[1],
        "yt_music_title": mid_ytm or ytm_pool[1],
        "yt_playlist_title": mid_ytp or ytp_pool[1],
    })

    # 3번: 롱테일형 (low competition)
    results.append({
        "set_label": labels[2],
        "yt_music_title": long_ytm or ytm_pool[2],
        "yt_playlist_title": long_ytp or ytp_pool[2],
    })

    return results
