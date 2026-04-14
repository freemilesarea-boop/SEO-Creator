"""
제목 생성 엔진

출력:
1) YouTube Music 제목 – 2~5어절, 짧고 검색 친화적, 과장 금지
2) YouTube Playlist 제목 – 12~35자+, 장르+감성+상황+키워드 결합, 자연어 문장형

세트별 intent hard constraint:
- 감성형: mood 우선, discovery 제한 허용
- 검색형: discovery + utility 허용
- 롱테일형: utility + creator 허용
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
from backend.app.services.intent_classifier import classify_intent

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_dict_cache: dict | None = None


def _load_dictionary() -> dict:
    global _dict_cache
    if _dict_cache is None:
        with open(_DATA_DIR / "keyword_dictionary.json", encoding="utf-8") as f:
            _dict_cache = json.load(f)
    return _dict_cache


def _pick_display_keyword(key: str, section: str, lang: str) -> str:
    d = _load_dictionary()
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


# ── 세트별 intent 정책 ──

# hard: 이 intent만 허용  |  soft_fallback: 후보 부족 시 허용 확장
_SET_INTENT_POLICY = {
    "emotional": {
        "hard_allow": {"mood", "discovery"},
        "hard_block": {"creator", "utility"},
        "fallback_allow": {"mood", "discovery"},
    },
    "search": {
        "hard_allow": {"discovery", "utility"},
        "hard_block": {"creator"},
        "fallback_allow": {"discovery", "utility", "mood"},
    },
    "longtail": {
        "hard_allow": {"utility", "creator"},
        "hard_block": {"mood"},
        "fallback_allow": {"utility", "creator", "discovery"},
    },
}


def _filter_titles_by_intent(
    titles: list[str],
    set_type: str,
    situation: str,
) -> list[str]:
    """세트 타입에 맞는 intent의 제목만 필터링."""
    policy = _SET_INTENT_POLICY.get(set_type, {})
    hard_allow = policy.get("hard_allow", {"mood", "discovery", "utility", "creator"})
    hard_block = policy.get("hard_block", set())

    filtered = []
    for t in titles:
        intent = classify_intent(t)
        if intent in hard_block:
            continue
        if intent in hard_allow:
            filtered.append(t)

    return filtered


def _filter_titles_with_fallback(
    titles: list[str],
    set_type: str,
    situation: str,
) -> list[str]:
    """hard filter → 부족하면 fallback으로 완화."""
    result = _filter_titles_by_intent(titles, set_type, situation)
    if len(result) >= 2:
        return result

    # fallback 허용 확장
    policy = _SET_INTENT_POLICY.get(set_type, {})
    fallback_allow = policy.get("fallback_allow", {"mood", "discovery", "utility", "creator"})

    for t in titles:
        if t in result:
            continue
        intent = classify_intent(t)
        if intent in fallback_allow:
            result.append(t)
        if len(result) >= 3:
            break

    return result


def _purity_score(title: str, set_type: str) -> float:
    """제목이 세트 의도와 얼마나 부합하는지 0~1."""
    intent = classify_intent(title)
    policy = _SET_INTENT_POLICY.get(set_type, {})
    hard_allow = policy.get("hard_allow", set())

    if intent in hard_allow:
        return 1.0
    fallback = policy.get("fallback_allow", set())
    if intent in fallback:
        return 0.5
    return 0.0


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
    analysis: AnalysisResult, lang: str, count: int = 12
) -> list[str]:
    genre = _pick_display_keyword(analysis.primary_genre, "genres", lang)
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

    d = _load_dictionary()
    templates = (
        d.get("title_templates", {}).get("yt_music", {}).get("ko" if lang == "ko" else "en", [])
    )
    for tmpl in templates[:10]:
        try:
            title = tmpl.format(genre=genre, mood=mood, situation=situation, keyword=genre)
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
    analysis: AnalysisResult, lang: str, count: int = 12
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

    d = _load_dictionary()
    templates = (
        d.get("title_templates", {}).get("yt_playlist", {}).get("ko" if lang == "ko" else "en", [])
    )
    for tmpl in templates[:10]:
        try:
            title = tmpl.format(genre=genre, mood=mood, situation=situation, keyword=genre)
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
    return unique[:count]


# ── 키워드 기반 제목 생성 ──


def _pick_keywords_hard_filtered(
    keyword_scores: list[KeywordScore],
    set_type: str,
    target_types: list[str],
    situation: str,
    count: int = 3,
) -> list[str]:
    """세트 타입의 intent hard filter를 적용하여 키워드를 선택."""
    policy = _SET_INTENT_POLICY.get(set_type, {})
    hard_allow = policy.get("hard_allow", {"mood", "discovery", "utility", "creator"})
    hard_block = policy.get("hard_block", set())
    fallback_allow = policy.get("fallback_allow", hard_allow)

    # 1차: hard_allow만
    primary: list[tuple[str, float]] = []
    for ks in keyword_scores:
        kw_type = classify_keyword(ks.keyword)
        if kw_type not in target_types:
            continue
        if not is_title_consistent(situation, ks.keyword):
            continue
        intent = classify_intent(ks.keyword)
        if intent in hard_block:
            continue
        if intent in hard_allow:
            primary.append((ks.keyword, ks.total_score + 0.1))
        elif intent in fallback_allow:
            primary.append((ks.keyword, ks.total_score))

    primary.sort(key=lambda x: x[1], reverse=True)
    result = [kw for kw, _ in primary[:count]]

    if len(result) >= count:
        return result

    # 2차: fallback 완화 (hard_block 외 전부 허용)
    for ks in keyword_scores:
        if ks.keyword in result:
            continue
        kw_type = classify_keyword(ks.keyword)
        if kw_type not in target_types and kw_type != "mid-tail":
            continue
        if not is_title_consistent(situation, ks.keyword):
            continue
        intent = classify_intent(ks.keyword)
        if intent in hard_block:
            continue
        result.append(ks.keyword)
        if len(result) >= count:
            break

    return result


def _make_title_pair(
    kws: list[str],
    genre: str,
    language: str,
    situation: str,
) -> tuple[str, str]:
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


# ── 3세트 생성 (hard constraint 적용) ──


def generate_title_sets(
    analysis: AnalysisResult,
    keyword_scores: list[KeywordScore],
    language: str = "ko",
) -> list[dict]:
    """
    3세트 제목 생성 (세트별 intent hard constraint 적용):
    - 감성형: mood intent (감성/분위기 키워드)
    - 검색형: discovery + utility intent (mid-tail)
    - 롱테일형: utility + creator intent (long-tail)
    """
    situation = analysis.primary_situation
    genre = _pick_display_keyword(analysis.primary_genre, "genres", language)

    # ── 감성형: template 기반 + mood intent hard filter ──
    ytm_pool = _generate_ytm_titles(analysis, language, count=12)
    ytp_pool = _generate_ytp_titles(analysis, language, count=12)

    # template 제목들을 mood intent로 필터
    ytm_mood = _filter_titles_with_fallback(ytm_pool, "emotional", situation)
    ytp_mood = _filter_titles_with_fallback(ytp_pool, "emotional", situation)

    # purity 높은 순으로 정렬
    ytm_mood.sort(key=lambda t: _purity_score(t, "emotional"), reverse=True)
    ytp_mood.sort(key=lambda t: _purity_score(t, "emotional"), reverse=True)

    # ── 검색형: keyword 기반 + discovery/utility hard filter ──
    search_kws = _pick_keywords_hard_filtered(
        keyword_scores, "search",
        ["mid-tail", "long-tail"], situation, 3,
    )
    search_ytm, search_ytp = _make_title_pair(search_kws, genre, language, situation)

    # ── 롱테일형: keyword 기반 + utility/creator hard filter ──
    longtail_kws = _pick_keywords_hard_filtered(
        keyword_scores, "longtail",
        ["long-tail", "mid-tail"], situation, 3,
    )
    longtail_ytm, longtail_ytp = _make_title_pair(longtail_kws, genre, language, situation)

    # ── fallback 준비 ──
    if not ytm_mood:
        ytm_mood = ytm_pool[:3]
    if not ytp_mood:
        ytp_mood = ytp_pool[:3]

    # ── 라벨 ──
    set_labels_ko = ["감성형", "검색형", "롱테일형"]
    set_labels_en = ["Emotional", "Search-Optimized", "Long-Tail"]
    labels = set_labels_ko if language == "ko" else set_labels_en

    # ── 최종 purity 검증: 각 세트의 제목이 세트 성격에 맞는지 확인 ──
    def _pick_best(candidates: list[str], set_type: str) -> str:
        if not candidates:
            return ""
        scored = [(t, _purity_score(t, set_type)) for t in candidates]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[0][0]

    results = [
        {
            "set_label": labels[0],
            "yt_music_title": _pick_best(ytm_mood, "emotional"),
            "yt_playlist_title": _pick_best(ytp_mood, "emotional"),
        },
        {
            "set_label": labels[1],
            "yt_music_title": search_ytm or (ytm_pool[1] if len(ytm_pool) > 1 else ytm_pool[0]),
            "yt_playlist_title": search_ytp or (ytp_pool[1] if len(ytp_pool) > 1 else ytp_pool[0]),
        },
        {
            "set_label": labels[2],
            "yt_music_title": longtail_ytm or (ytm_pool[2] if len(ytm_pool) > 2 else ytm_pool[0]),
            "yt_playlist_title": longtail_ytp or (ytp_pool[2] if len(ytp_pool) > 2 else ytp_pool[0]),
        },
    ]

    return results
