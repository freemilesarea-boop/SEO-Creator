"""
Semantic Coherence Layer

situation을 기준으로 mood, visual, title의 일관성을 보장한다.
situation-first 구조: situation → compatible mood → compatible visuals
"""

# ---------------------------------------------------------------------------
# [2] Situation-Mood compatibility matrix
# ---------------------------------------------------------------------------

# 각 situation에 대해 우대(boost) / 패널티(penalize) mood 정의
SITUATION_MOOD_BOOST: dict[str, set[str]] = {
    "workout": {"energetic", "intense", "happy"},
    "party": {"energetic", "sexy", "happy", "intense"},
    "study": {"chill", "peaceful", "dreamy"},
    "sleep": {"peaceful", "dreamy", "chill"},
    "cafe": {"chill", "romantic", "nostalgic", "peaceful"},
    "night_drive": {"dark", "dreamy", "nostalgic", "emotional", "sexy"},
    "late_night": {"dark", "dreamy", "lonely", "emotional", "cinematic"},
    "rain": {"emotional", "nostalgic", "sad", "chill"},
    "morning": {"peaceful", "happy"},
    "walk": {"chill", "happy", "nostalgic", "peaceful"},
    "commute": {"energetic", "happy", "chill"},
    "reading": {"peaceful", "chill", "dreamy"},
    "cooking": {"chill", "peaceful", "happy"},
    "breakup": {"emotional", "sad", "lonely", "dark"},
    "sunset": {"nostalgic", "dreamy", "romantic", "chill"},
    "travel": {"happy", "energetic", "nostalgic", "dreamy"},
}

SITUATION_MOOD_PENALIZE: dict[str, set[str]] = {
    "workout": {"emotional", "sad", "nostalgic", "dreamy", "peaceful", "lonely", "romantic"},
    "party": {"sad", "lonely", "peaceful", "dreamy"},
    "study": {"energetic", "intense", "sexy", "dark"},
    "sleep": {"energetic", "intense", "sexy", "happy"},
    "cafe": {"intense", "dark", "energetic"},
    "night_drive": {"happy", "peaceful"},
    "late_night": {"happy", "energetic"},
    "rain": {"energetic", "happy", "sexy"},
    "morning": {"dark", "intense", "sexy", "sad"},
    "walk": {"intense", "dark", "sexy"},
    "commute": {"sad", "lonely", "dark"},
    "reading": {"energetic", "intense", "sexy"},
    "cooking": {"dark", "intense", "sexy", "energetic", "sad", "lonely"},
    "breakup": {"happy", "energetic"},
    "sunset": {"intense", "energetic", "dark"},
    "travel": {"sad", "lonely", "dark"},
}


def pick_compatible_mood(situation: str, detected_moods: list[str]) -> str:
    """situation과 가장 호환되는 mood를 detected_moods에서 선택한다."""
    if not detected_moods:
        # fallback
        boosts = SITUATION_MOOD_BOOST.get(situation, set())
        return next(iter(boosts)) if boosts else "chill"

    boost_set = SITUATION_MOOD_BOOST.get(situation, set())
    penalty_set = SITUATION_MOOD_PENALIZE.get(situation, set())

    # 점수 계산: boost +2, neutral 0, penalty -3
    scored: list[tuple[str, int]] = []
    for i, mood in enumerate(detected_moods):
        score = -i  # 원래 순위 반영 (0이 최상위)
        if mood in boost_set:
            score += 5
        if mood in penalty_set:
            score -= 6
        scored.append((mood, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[0][0]


def filter_compatible_moods(situation: str, detected_moods: list[str], max_count: int = 2) -> list[str]:
    """situation과 호환되는 mood만 최대 max_count개 반환."""
    boost_set = SITUATION_MOOD_BOOST.get(situation, set())
    penalty_set = SITUATION_MOOD_PENALIZE.get(situation, set())

    scored: list[tuple[str, int]] = []
    for i, mood in enumerate(detected_moods):
        score = -i
        if mood in boost_set:
            score += 5
        if mood in penalty_set:
            score -= 6
        scored.append((mood, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [m for m, s in scored[:max_count] if s > -5]


# ---------------------------------------------------------------------------
# [3] Situation-Visual compatibility matrix
# ---------------------------------------------------------------------------

SITUATION_VISUAL_BOOST: dict[str, set[str]] = {
    "workout": {"gym", "running", "dumbbell", "sweat", "boxing", "shoes", "motion", "energy", "neon gym", "powerful"},
    "party": {"club", "disco", "crowd", "dj", "strobe", "dance", "neon", "champagne", "laser", "night"},
    "study": {"desk", "lamp", "book", "library", "notebook", "laptop", "minimalist", "pen", "focus"},
    "sleep": {"moon", "star", "bedroom", "pillow", "night light", "cloud", "crescent", "dim"},
    "cafe": {"coffee", "latte", "cafe", "bookshelf", "warm", "croissant", "wood", "window seat"},
    "night_drive": {"highway", "dashboard", "car", "tunnel", "city", "neon", "rearview", "road"},
    "late_night": {"city", "midnight", "neon", "moon", "rooftop", "alley", "desk", "dim"},
    "rain": {"rain", "umbrella", "puddle", "fog", "window", "droplet", "wet", "mist"},
    "morning": {"sunrise", "coffee", "alarm", "golden hour", "dew", "fresh", "curtain"},
    "walk": {"path", "park", "leaves", "sky", "bridge", "street", "sunshine"},
    "commute": {"train", "subway", "headphones", "bus", "city", "morning", "rush"},
    "breakup": {"torn", "empty", "wilted", "rain", "fade", "letter", "alone"},
    "sunset": {"sunset", "ocean", "golden", "horizon", "silhouette", "sky", "beach"},
    "travel": {"airplane", "map", "road", "mountain", "train", "backpack", "scenery"},
}

SITUATION_VISUAL_BLOCK: dict[str, set[str]] = {
    "workout": {"rain on window", "handwritten diary", "empty street at night", "old photograph",
                "lonely bedroom", "candle", "falling petals", "wilted flower", "torn photo",
                "empty bench", "rainy window", "handwritten letter", "single candle",
                "rain at bus stop", "fading footprints", "empty chair"},
    "party": {"pillow", "moon", "bedroom", "study", "desk", "lamp", "book", "library",
              "candle", "empty bench", "lonely", "diary", "letter"},
    "study": {"club", "disco", "dj", "dance floor", "crowd", "champagne", "strobe",
              "gym", "dumbbell", "boxing"},
    "sleep": {"gym", "running", "club", "party", "dj", "crowd", "workout", "boxing",
              "strobe", "dance floor"},
    "morning": {"club", "disco", "dj", "neon alley", "midnight", "dark alley",
                "abandoned building", "cracked mirror"},
    "cooking": {"gym", "club", "highway", "midnight", "neon alley", "dark alley",
                "thunderstorm", "abandoned building"},
}


def filter_visuals_for_situation(situation: str, visuals: list[str]) -> list[str]:
    """situation과 호환되는 visual만 필터링. 부적합한 것은 제거."""
    block_set = SITUATION_VISUAL_BLOCK.get(situation, set())
    boost_set = SITUATION_VISUAL_BOOST.get(situation, set())

    filtered: list[str] = []
    for v in visuals:
        v_lower = v.lower()
        # 블록 리스트에 포함되면 제거
        blocked = False
        for block_kw in block_set:
            if block_kw.lower() in v_lower:
                blocked = True
                break
        if blocked:
            continue
        filtered.append(v)

    # boost 키워드가 포함된 항목을 앞으로
    def boost_score(visual: str) -> int:
        v_lower = visual.lower()
        score = 0
        for bk in boost_set:
            if bk.lower() in v_lower:
                score += 1
        return -score  # 낮을수록 앞으로

    filtered.sort(key=boost_score)
    return filtered


def get_situation_visuals(situation: str) -> list[str]:
    """situation에 맞는 기본 visual 후보를 반환."""
    defaults: dict[str, list[str]] = {
        "workout": ["neon gym interior", "running shoes on road", "motion blur athlete", "dumbbell closeup", "boxing gloves"],
        "party": ["disco ball reflections", "crowd with hands up", "DJ booth neon", "club dance floor", "champagne toast"],
        "study": ["desk lamp and books", "library aisle", "minimalist desk setup", "notebook and pen", "laptop focus"],
        "sleep": ["moonlit bedroom", "stars through window", "soft pillow close", "dim night light", "crescent moon"],
        "cafe": ["latte art closeup", "cafe window seat", "warm wood interior", "bookshelf cafe", "coffee steam"],
        "night_drive": ["highway lights streaking", "dashboard glow", "city skyline from car", "tunnel lights", "neon road"],
        "late_night": ["city skyline midnight", "neon alley", "moon over rooftop", "dimly lit desk", "empty highway"],
        "rain": ["raindrops on glass", "umbrella in rain", "foggy street", "puddle reflection", "rainy window"],
        "morning": ["sunrise through window", "morning coffee pour", "golden hour bedroom", "dew on grass", "fresh air"],
        "walk": ["tree-lined path", "park bench", "autumn leaves", "open sky", "quiet street"],
        "commute": ["subway headphones", "train window scenery", "morning city street", "bus ride view", "rush hour crowd"],
        "breakup": ["torn photograph", "empty park bench", "wilted flower", "rain at window", "fading footprints"],
        "sunset": ["ocean sunset", "rooftop skyline dusk", "golden light silhouette", "beach bonfire", "orange sky"],
        "travel": ["airplane window clouds", "open highway", "mountain backpacker", "train window scenery", "world map"],
    }
    return defaults.get(situation, ["headphones on table", "vinyl record", "music notes"])


# ---------------------------------------------------------------------------
# [4] Title consistency check
# ---------------------------------------------------------------------------

_TITLE_CONFLICT_WORDS: dict[str, set[str]] = {
    "workout": {"슬픈", "감성", "이별", "비 오는", "외로운", "쓸쓸", "눈물", "잠잘", "수면",
                "sad", "lonely", "rainy", "breakup", "tearful", "lullaby", "sleep", "diary"},
    "party": {"잔잔한", "수면", "잠잘", "공부", "집중", "조용한",
              "calm", "sleep", "study", "lullaby", "focus", "quiet"},
    "study": {"파티", "클럽", "신나는", "파워풀", "댄스",
              "party", "club", "dance", "hype", "turn up"},
    "sleep": {"운동", "헬스", "파티", "클럽", "파워풀", "강렬",
              "workout", "gym", "party", "club", "intense", "pump"},
    "morning": {"새벽", "심야", "클럽", "어두운",
                "midnight", "late night", "club", "dark"},
}


def is_title_consistent(situation: str, title: str) -> bool:
    """제목이 situation과 의미적으로 충돌하지 않는지 확인."""
    conflict_words = _TITLE_CONFLICT_WORDS.get(situation, set())
    title_lower = title.lower()
    for cw in conflict_words:
        if cw.lower() in title_lower:
            return False
    return True
