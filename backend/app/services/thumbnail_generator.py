"""
썸네일 키워드 / 시안 생성 엔진 (situation-aware)

situation을 기준으로 mood/visual 일관성을 보장한다.
"""

import json
import random
from pathlib import Path

from backend.app.models.schemas import AnalysisResult, ThumbnailSuggestion
from backend.app.services.coherence import (
    pick_compatible_mood,
    filter_visuals_for_situation,
    get_situation_visuals,
)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_dict_cache: dict | None = None


def _load_dictionary() -> dict:
    global _dict_cache
    if _dict_cache is None:
        with open(_DATA_DIR / "keyword_dictionary.json", encoding="utf-8") as f:
            _dict_cache = json.load(f)
    return _dict_cache


# ── 컬러톤 (situation-aware) ──


def _get_color_tones(genre: str, mood: str, situation: str) -> list[str]:
    d = _load_dictionary()
    tones: list[str] = []

    # situation의 visual_scenes에서 컬러 가져오기
    scenes = d.get("visuals", {}).get("visual_scenes", {})
    for scene_key, scene_data in scenes.items():
        if situation in scene_data.get("best_for_situations", []):
            if mood in scene_data.get("best_for_moods", []):
                tones.extend(scene_data.get("color_palette", []))
                break

    # fallback: genre + mood 컬러
    if not tones:
        genre_tones = d.get("genres", {}).get(genre, {}).get("color_tones", [])
        mood_tones = d.get("moods", {}).get(mood, {}).get("color_tones", [])
        tones.extend(genre_tones)
        tones.extend(mood_tones)

    if not tones:
        tones = ["dark blue", "warm orange", "soft gray"]

    seen: set[str] = set()
    unique: list[str] = []
    for t in tones:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique.append(t)
    return unique[:4]


# ── 비주얼 콘셉트 (situation-first) ──


def _get_visual_concepts(mood: str, situation: str) -> list[str]:
    """situation 기준으로 visual을 가져오고, mood visual은 호환되는 것만 추가."""
    # 1. situation 전용 비주얼
    sit_visuals = get_situation_visuals(situation)

    # 2. mood 비주얼 중 호환되는 것만 추가
    d = _load_dictionary()
    mood_vis = d.get("moods", {}).get(mood, {}).get("visual_concepts", [])
    compatible_mood_vis = filter_visuals_for_situation(situation, mood_vis)

    # situation 비주얼 우선, mood 비주얼 보조
    combined = list(sit_visuals)
    for v in compatible_mood_vis:
        if v not in combined:
            combined.append(v)

    return combined[:6]


# ── 레이아웃 ──


def _get_layout(situation: str) -> str:
    d = _load_dictionary()
    layouts = d.get("thumbnail_layouts", [])
    if not layouts:
        layouts = [
            "center portrait + bold serif title",
            "left portrait / right text",
            "full bleed background + overlay text",
            "split screen with gradient",
        ]

    # situation별 선호 레이아웃
    situation_layout_preference: dict[str, list[str]] = {
        "workout": ["full bleed background + overlay text bottom", "cinematic widescreen bar + center text"],
        "party": ["full bleed background + overlay text bottom", "collage grid 2x2 with overlay title"],
        "study": ["minimal center text on blurred background", "center portrait + bold serif title"],
        "sleep": ["minimal center text on blurred background"],
        "cafe": ["side crop portrait + vertical title", "left portrait / right text"],
    }

    preferred = situation_layout_preference.get(situation, [])
    # 선호 레이아웃 중 사전에 있는 것을 찾기
    for pref in preferred:
        if pref in layouts:
            return pref

    return random.choice(layouts)


# ── 인물 여부 추정 ──


def _should_have_person(mood: str, situation: str) -> bool:
    # situation 기반 판단
    person_situations = {"workout", "party", "commute", "walk"}
    no_person_situations = {"study", "sleep", "reading", "rain"}

    if situation in person_situations:
        return True
    if situation in no_person_situations:
        return False

    person_moods = {"sexy", "romantic", "emotional", "happy", "energetic", "intense"}
    if mood in person_moods:
        return True
    return False


# ── 메인/보조 키워드 (situation-first) ──


def _build_main_keywords(
    genre: str, mood: str, situation: str, language: str
) -> list[str]:
    d = _load_dictionary()
    sit_en = d.get("situations", {}).get(situation, {}).get("en_keywords", [situation])
    mood_en = d.get("moods", {}).get(mood, {}).get("en_keywords", [mood])
    genre_en = d.get("genres", {}).get(genre, {}).get("en_keywords", [genre])

    main = []
    if sit_en:
        main.append(sit_en[0])
    if mood_en:
        main.append(mood_en[0])
    if genre_en:
        main.append(genre_en[0])

    # situation-aware visual 추가
    concepts = _get_visual_concepts(mood, situation)
    if concepts:
        main.append(concepts[0])

    return main[:5]


def _build_sub_keywords(
    genre: str, mood: str, situation: str
) -> list[str]:
    concepts = _get_visual_concepts(mood, situation)
    tones = _get_color_tones(genre, mood, situation)

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
    situation = analysis.primary_situation

    # situation-first: situation과 호환되는 mood 선택
    mood = pick_compatible_mood(situation, analysis.detected_moods)

    main_kw = _build_main_keywords(genre, mood, situation, language)
    sub_kw = _build_sub_keywords(genre, mood, situation)
    tones = _get_color_tones(genre, mood, situation)
    concepts = _get_visual_concepts(mood, situation)
    has_person = _should_have_person(mood, situation)
    layout = _get_layout(situation)
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
    variants: list[ThumbnailSuggestion] = []
    for _ in range(count):
        variants.append(generate_thumbnail(analysis, language))
    return variants
