"""
썸네일 키워드 / 시안 생성 엔진

출력:
- 메인 검색 키워드
- 보조 키워드
- 컬러톤
- 배경 콘셉트
- 인물 여부
- 레이아웃 제안
- 텍스트 오버레이 문구
"""

import json
import random
from pathlib import Path

from backend.app.models.schemas import AnalysisResult, ThumbnailSuggestion

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_dict_cache: dict | None = None


def _load_dictionary() -> dict:
    global _dict_cache
    if _dict_cache is None:
        with open(_DATA_DIR / "keyword_dictionary.json", encoding="utf-8") as f:
            _dict_cache = json.load(f)
    return _dict_cache


# ── 컬러톤 ──


def _get_color_tones(genre: str, mood: str) -> list[str]:
    d = _load_dictionary()
    tones: list[str] = []

    genre_tones = d.get("genres", {}).get(genre, {}).get("color_tones", [])
    mood_tones = d.get("moods", {}).get(mood, {}).get("color_tones", [])
    tones.extend(genre_tones)
    tones.extend(mood_tones)

    if not tones:
        tones = ["dark blue", "warm orange", "soft gray"]

    # 중복 제거
    seen: set[str] = set()
    unique: list[str] = []
    for t in tones:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique.append(t)
    return unique[:4]


# ── 비주얼 콘셉트 ──


def _get_visual_concepts(mood: str, situation: str) -> list[str]:
    d = _load_dictionary()
    concepts: list[str] = []

    mood_vis = d.get("moods", {}).get(mood, {}).get("visual_concepts", [])
    sit_vis = d.get("situations", {}).get(situation, {}).get("visual_concepts", [])
    concepts.extend(mood_vis)
    concepts.extend(sit_vis)

    if not concepts:
        concepts = ["city night", "sunset", "headphones"]
    return list(dict.fromkeys(concepts))[:6]


# ── 레이아웃 ──


def _get_layout(mood: str) -> str:
    d = _load_dictionary()
    layouts = d.get("thumbnail_layouts", [])
    if not layouts:
        layouts = [
            "center portrait + bold serif title",
            "left portrait / right text",
            "full bleed background + overlay text",
            "split screen with gradient",
        ]
    return random.choice(layouts)


# ── 인물 여부 추정 ──


_PERSON_MOODS = {"sexy", "romantic", "emotional", "happy", "energetic", "intense"}
_NO_PERSON_MOODS = {"peaceful", "dreamy", "chill"}


def _should_have_person(mood: str, situation: str) -> bool:
    if mood in _PERSON_MOODS:
        return True
    if mood in _NO_PERSON_MOODS and situation in {"sleep", "study", "reading"}:
        return False
    return random.choice([True, False])


# ── 메인/보조 키워드 ──


def _build_main_keywords(
    genre: str, mood: str, situation: str, language: str
) -> list[str]:
    """영문 검색용 메인 키워드 (이미지 검색 최적화)."""
    d = _load_dictionary()
    genre_en = d.get("genres", {}).get(genre, {}).get("en_keywords", [genre])
    mood_en = d.get("moods", {}).get(mood, {}).get("en_keywords", [mood])
    sit_en = d.get("situations", {}).get(situation, {}).get("en_keywords", [situation])

    main = []
    if sit_en:
        main.append(sit_en[0])
    if mood_en:
        main.append(mood_en[0])
    if genre_en:
        main.append(genre_en[0])

    # 콘셉트 단어 추가
    concepts = _get_visual_concepts(mood, situation)
    if concepts:
        main.append(concepts[0])

    return main[:5]


def _build_sub_keywords(
    genre: str, mood: str, situation: str
) -> list[str]:
    concepts = _get_visual_concepts(mood, situation)
    tones = _get_color_tones(genre, mood)

    sub: list[str] = []
    sub.extend(concepts[1:4])
    sub.extend(tones[:2])
    return sub[:5]


# ── 텍스트 오버레이 ──

_OVERLAY_KO_TEMPLATES = [
    "{mood} {genre}",
    "{situation} 감성",
    "{mood} Playlist",
    "{genre} Mix",
    "{situation} Mood",
    "{mood} Vibes",
]

_OVERLAY_EN_TEMPLATES = [
    "{mood} {genre}",
    "{situation} Vibes",
    "{mood} Playlist",
    "{genre} Mix",
    "{situation} Mood",
    "Feel the {mood}",
]


def _generate_overlay_text(
    genre: str, mood: str, situation: str, language: str
) -> str:
    d = _load_dictionary()
    genre_kw = d.get("genres", {}).get(genre, {})
    mood_kw = d.get("moods", {}).get(mood, {})
    sit_kw = d.get("situations", {}).get(situation, {})

    if language == "ko":
        g = (genre_kw.get("ko_keywords") or [genre])[0]
        m = (mood_kw.get("ko_keywords") or [mood])[0]
        s = (sit_kw.get("ko_keywords") or [situation])[0]
        templates = _OVERLAY_KO_TEMPLATES
    else:
        g = (genre_kw.get("en_keywords") or [genre])[0]
        m = (mood_kw.get("en_keywords") or [mood])[0]
        s = (sit_kw.get("en_keywords") or [situation])[0]
        templates = _OVERLAY_EN_TEMPLATES

    tmpl = random.choice(templates)
    return tmpl.format(genre=g, mood=m, situation=s)


# ── 공개 API ──


def generate_thumbnail(
    analysis: AnalysisResult,
    language: str = "ko",
) -> ThumbnailSuggestion:
    genre = analysis.primary_genre
    mood = analysis.primary_mood
    situation = analysis.primary_situation

    main_kw = _build_main_keywords(genre, mood, situation, language)
    sub_kw = _build_sub_keywords(genre, mood, situation)
    tones = _get_color_tones(genre, mood)
    concepts = _get_visual_concepts(mood, situation)
    has_person = _should_have_person(mood, situation)
    layout = _get_layout(mood)
    overlay = _generate_overlay_text(genre, mood, situation, language)

    return ThumbnailSuggestion(
        main_keywords=main_kw,
        sub_keywords=sub_kw,
        color_tone=tones,
        background_concept=concepts[0] if concepts else "abstract gradient",
        has_person=has_person,
        layout=layout,
        text_overlay=overlay,
    )


def generate_thumbnail_variants(
    analysis: AnalysisResult,
    language: str = "ko",
    count: int = 3,
) -> list[ThumbnailSuggestion]:
    """여러 썸네일 시안 변형을 생성한다."""
    variants: list[ThumbnailSuggestion] = []
    for _ in range(count):
        variants.append(generate_thumbnail(analysis, language))
    return variants
