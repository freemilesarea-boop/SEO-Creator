"""
Title Explanation Generator

각 제목에 대해 왜 이 키워드가 선택됐는지,
어떤 SEO 요소가 반영됐는지 설명을 생성한다.
"""

from backend.app.services.keyword_engine import (
    classify_keyword,
    specificity_score,
    has_genre_anchor,
    genre_anchor_score,
    competition_score,
)
from backend.app.services.intent_classifier import classify_intent


def _analyze_fragments(title: str) -> list[dict]:
    """제목의 각 구성 요소를 분석한다."""
    fragments: list[dict] = []

    # 상황 마커
    _SITUATION_MARKERS = {
        "헬스장에서": "low competition context",
        "러닝할 때": "low competition context",
        "운동할 때": "utility context",
        "운동할때": "utility context",
        "공부할 때": "utility context",
        "카페에서": "low competition context",
        "커피숍에서": "low competition context",
        "새벽에": "time-specific context",
        "밤에": "time-specific context",
        "잠잘 때": "utility context",
        "비 오는 날": "weather context",
        "드라이브할 때": "activity context",
        "밤 드라이브": "specific situation",
        "야간 드라이브": "specific situation",
        "출퇴근할 때": "utility context",
        "산책할 때": "activity context",
        "at the gym": "low competition context",
        "while running": "low competition context",
        "for workout": "utility context",
        "late night": "time-specific context",
        "at a coffee shop": "low competition context",
    }

    # 장르 마커
    _GENRE_MARKERS = {
        "케이팝": "genre anchor",
        "kpop": "genre anchor",
        "K-POP": "genre anchor",
        "팝": "genre anchor",
        "pop": "genre anchor",
        "알앤비": "genre anchor",
        "rnb": "genre anchor",
        "로파이": "genre anchor",
        "lofi": "genre anchor",
        "힙합": "genre anchor",
        "재즈": "genre anchor",
        "발라드": "genre anchor",
        "인디": "genre anchor",
        "록": "genre anchor",
        "클래식": "genre anchor",
        "어쿠스틱": "genre anchor",
        "시티팝": "genre anchor",
    }

    # CTR 부스터
    _CTR_MARKERS = {
        "에너지 넘치는": "CTR booster (energy modifier)",
        "신나는": "CTR booster (excitement modifier)",
        "텐션 올라가는": "CTR booster (hype modifier)",
        "분위기 미치는": "CTR booster (vibe modifier)",
        "감성": "CTR booster (emotional hook)",
        "감성적인": "CTR booster (emotional hook)",
        "차분한": "CTR booster (calm modifier)",
        "섹시한": "CTR booster (allure modifier)",
        "몽환": "CTR booster (dreamy modifier)",
        "잔잔한": "CTR booster (soft modifier)",
        "파워풀": "CTR booster (power modifier)",
        "듣기 좋은": "utility signal (user intent match)",
        "틀기 좋은": "utility signal (user intent match)",
        "듣는": "utility signal",
        "energetic": "CTR booster",
        "chill": "CTR booster",
        "emotional": "CTR booster",
        "dreamy": "CTR booster",
    }

    # SEO 신호
    _SEO_MARKERS = {
        "플레이리스트": "SEO signal (playlist keyword)",
        "playlist": "SEO signal (playlist keyword)",
        "모음": "SEO signal (collection keyword)",
        "추천": "SEO signal (recommendation keyword)",
        "bgm": "SEO signal (creator keyword)",
        "mix": "SEO signal (mix keyword)",
        "2025": "SEO signal (recency)",
        "2024": "SEO signal (recency)",
        "신곡": "SEO signal (freshness)",
        "히트곡": "SEO signal (popularity)",
    }

    title_lower = title.lower()

    for marker, reason in _SITUATION_MARKERS.items():
        if marker in title or marker.lower() in title_lower:
            fragments.append({"text": marker, "reason": reason, "type": "situation"})

    for marker, reason in _GENRE_MARKERS.items():
        if marker in title or marker.lower() in title_lower:
            fragments.append({"text": marker, "reason": reason, "type": "genre"})
            break  # 장르는 1개만

    for marker, reason in _CTR_MARKERS.items():
        if marker in title or marker.lower() in title_lower:
            fragments.append({"text": marker, "reason": reason, "type": "ctr"})

    for marker, reason in _SEO_MARKERS.items():
        if marker in title or marker.lower() in title_lower:
            fragments.append({"text": marker, "reason": reason, "type": "seo"})

    # 중복 제거
    seen: set[str] = set()
    unique: list[dict] = []
    for f in fragments:
        if f["text"] not in seen:
            seen.add(f["text"])
            unique.append(f)

    return unique


def explain_title(title: str, set_type: str) -> dict:
    """제목에 대한 SEO 설명을 생성한다.

    Returns:
        {
            "title": str,
            "keyword_type": str,       # head/mid-tail/long-tail
            "intent": str,             # discovery/utility/mood/creator
            "competition": str,        # low/medium/high
            "fragments": [...],
            "summary": str,
        }
    """
    if not title:
        return {"title": "", "keyword_type": "", "intent": "", "competition": "",
                "fragments": [], "summary": ""}

    kw_type = classify_keyword(title)
    intent = classify_intent(title)
    comp = competition_score(title)
    fragments = _analyze_fragments(title)
    ga = genre_anchor_score(title)
    spec, dims = specificity_score(title)

    # competition label
    if comp <= 0.3:
        comp_label = "low"
    elif comp <= 0.6:
        comp_label = "medium"
    else:
        comp_label = "high"

    # summary 생성
    parts: list[str] = []

    # set type 설명
    set_descriptions = {
        "감성형": "분위기/감성 키워드 중심 제목",
        "검색형": "검색량 기반 mid-tail 키워드 제목",
        "롱테일형": "경쟁도 낮은 구체적 long-tail 제목",
        "Emotional": "mood-focused emotional title",
        "Search-Optimized": "search volume mid-tail title",
        "Long-Tail": "low competition specific long-tail title",
    }
    if set_type in set_descriptions:
        parts.append(set_descriptions[set_type])

    # 핵심 요소 설명
    genre_frags = [f for f in fragments if f["type"] == "genre"]
    sit_frags = [f for f in fragments if f["type"] == "situation"]
    ctr_frags = [f for f in fragments if f["type"] == "ctr"]
    seo_frags = [f for f in fragments if f["type"] == "seo"]

    if genre_frags:
        parts.append(f"장르 앵커: {genre_frags[0]['text']}")
    if sit_frags:
        parts.append(f"상황 특정: {sit_frags[0]['text']} ({comp_label} competition)")
    if ctr_frags:
        parts.append(f"CTR 요소: {ctr_frags[0]['text']}")
    if seo_frags:
        seo_names = [f["text"] for f in seo_frags[:2]]
        parts.append(f"SEO 신호: {', '.join(seo_names)}")

    if dims >= 3:
        parts.append(f"구체성 {dims}차원 (높음)")
    elif dims >= 2:
        parts.append(f"구체성 {dims}차원 (적정)")

    summary = " | ".join(parts)

    return {
        "title": title,
        "keyword_type": kw_type,
        "intent": intent,
        "competition": comp_label,
        "fragments": fragments,
        "summary": summary,
    }


def explain_result_set(
    yt_music_title: str,
    yt_playlist_title: str,
    set_label: str,
) -> dict:
    """결과 세트의 두 제목에 대한 설명을 생성한다."""
    return {
        "yt_music_explanation": explain_title(yt_music_title, set_label),
        "yt_playlist_explanation": explain_title(yt_playlist_title, set_label),
    }
