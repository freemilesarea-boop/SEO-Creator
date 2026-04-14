"""
Intent Classifier – 키워드 검색 의도 분류

4가지 intent:
- discovery: 탐색형 (추천, 모음, best, top)
- utility: 실용형 (운동할 때, 공부할 때, ~용)
- mood: 감성형 (감성, 몽환, chill, emotional)
- creator: 크리에이터형 (playlist, bgm, vlog, 플레이리스트)
"""


# ── Intent 패턴 매칭 ──

_DISCOVERY_PATTERNS = {
    "추천", "모음", "best", "top", "인기", "신곡", "히트", "히트곡",
    "명곡", "베스트", "songs", "hits", "trending", "chart", "popular",
    "2024", "2025", "new", "latest", "신규", "최신",
}

_UTILITY_PATTERNS = {
    "할 때", "할때", "하면서", "에서 듣", "듣기 좋은", "들으면",
    "배경음악", "배경", "운동용", "공부용", "수면용",
    "for", "while", "during", "at the", "to study", "to sleep",
    "to work", "for gym", "for running",
}

_MOOD_PATTERNS = {
    "감성", "감동", "몽환", "슬픈", "외로운", "설레는", "따뜻한",
    "차분한", "편안한", "신나는", "에너지", "로맨틱",
    "chill", "emotional", "dreamy", "sad", "lonely", "romantic",
    "vibes", "mood", "feel", "aesthetic", "vibe",
}

_CREATOR_PATTERNS = {
    "플레이리스트", "플리", "bgm", "brm", "vlog", "브이로그",
    "playlist", "mix", "compilation", "collection", "radio",
    "리스트", "셀렉션", "큐레이션",
}

# ── Situation → 선호 intent 매핑 ──

_SITUATION_PREFERRED_INTENT: dict[str, list[str]] = {
    "workout": ["utility", "discovery"],
    "study": ["utility", "creator"],
    "sleep": ["utility", "mood"],
    "cafe": ["mood", "creator"],
    "night_drive": ["mood", "utility"],
    "late_night": ["mood", "utility"],
    "rain": ["mood", "discovery"],
    "morning": ["utility", "mood"],
    "party": ["discovery", "utility"],
    "walk": ["mood", "discovery"],
    "commute": ["utility", "discovery"],
    "reading": ["mood", "creator"],
    "breakup": ["mood", "discovery"],
    "sunset": ["mood", "creator"],
    "travel": ["discovery", "utility"],
    "cooking": ["utility", "creator"],
}

# ── Intent 충돌 규칙 ──

_INTENT_CONFLICT: dict[str, dict[str, float]] = {
    "workout": {"mood": -0.08},
    "study": {"mood": -0.04},
    "sleep": {"discovery": -0.04},
    "party": {"mood": -0.06},
    "morning": {"mood": -0.03},
}


def classify_intent(keyword: str) -> str:
    """키워드의 검색 의도를 분류한다."""
    low = keyword.lower()

    scores = {"discovery": 0, "utility": 0, "mood": 0, "creator": 0}

    for p in _UTILITY_PATTERNS:
        if p in low:
            scores["utility"] += 2
    for p in _MOOD_PATTERNS:
        if p in low:
            scores["mood"] += 2
    for p in _DISCOVERY_PATTERNS:
        if p in low:
            scores["discovery"] += 2
    for p in _CREATOR_PATTERNS:
        if p in low:
            scores["creator"] += 2

    # 가장 높은 intent 반환 (동점 시 우선순위: utility > discovery > mood > creator)
    best = max(scores, key=lambda k: (scores[k], ["utility", "discovery", "mood", "creator"].index(k) * -1))
    if scores[best] == 0:
        # 패턴 매칭 없으면 길이 기반 추정
        words = keyword.split()
        if len(words) >= 5:
            return "utility"
        if len(words) <= 2:
            return "discovery"
        return "discovery"

    return best


def intent_match_score(keyword: str, situation: str) -> float:
    """키워드의 intent가 situation과 얼마나 맞는지 0~1 점수."""
    intent = classify_intent(keyword)
    preferred = _SITUATION_PREFERRED_INTENT.get(situation, ["discovery", "utility"])

    if intent == preferred[0]:
        score = 1.0
    elif intent in preferred:
        score = 0.7
    else:
        score = 0.3

    # 충돌 패널티
    conflicts = _INTENT_CONFLICT.get(situation, {})
    penalty = conflicts.get(intent, 0.0)
    score += penalty

    return max(0.0, min(1.0, score))


def filter_by_intent(
    keywords_with_scores: list[tuple[str, float]],
    target_intents: list[str],
    count: int = 5,
) -> list[tuple[str, float]]:
    """특정 intent에 해당하는 키워드만 필터링."""
    filtered = [
        (kw, score) for kw, score in keywords_with_scores
        if classify_intent(kw) in target_intents
    ]
    filtered.sort(key=lambda x: x[1], reverse=True)
    return filtered[:count]
