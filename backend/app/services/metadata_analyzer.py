"""Metadata Analyzer Service

Analyzes track metadata (artist names, track titles) from a playlist
to detect genre, mood, situation, and language.
"""

from backend.app.models.schemas import (
    TrackInfo, PlaylistData, AnalysisResult,
    Genre, Mood, Situation, Language,
)
import json
from pathlib import Path
from collections import Counter


# ---------------------------------------------------------------------------
# Load keyword dictionary
# ---------------------------------------------------------------------------

_DICTIONARY_PATH = Path(__file__).resolve().parent.parent / "data" / "keyword_dictionary.json"

_dictionary: dict | None = None


def _load_dictionary() -> dict:
    global _dictionary
    if _dictionary is None:
        if _DICTIONARY_PATH.exists():
            with open(_DICTIONARY_PATH, "r", encoding="utf-8") as f:
                _dictionary = json.load(f)
        else:
            _dictionary = {}
    return _dictionary


def _get_artist_genre_map() -> dict:
    return _load_dictionary().get("artist_genre_map", {})


def _get_genre_keywords() -> dict:
    d = _load_dictionary()
    if "genre_keywords" in d:
        return d["genre_keywords"]
    result: dict[str, list[str]] = {}
    for genre, data in d.get("genres", {}).items():
        kws = data.get("ko_keywords", []) + data.get("en_keywords", [])
        if kws:
            result[genre] = kws
    return result


def _get_mood_keywords() -> dict:
    d = _load_dictionary()
    if "mood_keywords" in d:
        return d["mood_keywords"]
    result: dict[str, list[str]] = {}
    for mood, data in d.get("moods", {}).items():
        kws = data.get("ko_keywords", []) + data.get("en_keywords", [])
        if kws:
            result[mood] = kws
    return result


def _get_situation_keywords() -> dict:
    d = _load_dictionary()
    if "situation_keywords" in d:
        return d["situation_keywords"]
    result: dict[str, list[str]] = {}
    for sit, data in d.get("situations", {}).items():
        kws = data.get("ko_keywords", []) + data.get("en_keywords", [])
        if kws:
            result[sit] = kws
    return result


# ---------------------------------------------------------------------------
# Genre-mood correlations
# ---------------------------------------------------------------------------

_GENRE_MOOD_CORRELATION: dict[str, list[str]] = {
    "lofi": ["chill", "dreamy", "peaceful"],
    "ballad": ["emotional", "sad", "romantic"],
    "edm": ["energetic", "intense", "happy"],
    "rnb": ["sexy", "chill", "romantic"],
    "hiphop": ["energetic", "dark", "intense"],
    "jazz": ["chill", "romantic", "nostalgic"],
    "acoustic": ["peaceful", "romantic", "nostalgic"],
    "rock": ["energetic", "intense", "dark"],
    "classical": ["peaceful", "emotional", "dreamy"],
    "indie": ["dreamy", "nostalgic", "chill"],
    "kpop": ["energetic", "happy", "emotional"],
    "pop": ["happy", "energetic", "romantic"],
    "latin": ["energetic", "sexy", "happy"],
    "jpop": ["happy", "energetic", "emotional"],
    "ost": ["emotional", "romantic", "nostalgic"],
}

# ---------------------------------------------------------------------------
# Mood-situation correlations (cooking/morning removed from broad moods)
# ---------------------------------------------------------------------------

_MOOD_SITUATION_CORRELATION: dict[str, list[str]] = {
    "chill": ["study", "cafe", "reading"],
    "emotional": ["rain", "night_drive"],
    "energetic": ["workout", "party", "commute"],
    "dreamy": ["night_drive", "reading"],
    "sexy": ["night_drive", "party", "late_night"],
    "happy": ["morning", "walk", "commute"],
    "sad": ["rain", "night_drive"],
    "dark": ["night_drive", "late_night"],
    "romantic": ["cafe", "walk"],
    "nostalgic": ["rain", "cafe", "walk"],
    "peaceful": ["morning", "reading", "walk"],
    "intense": ["workout", "party", "commute"],
}

# ---------------------------------------------------------------------------
# [3] Artist situation priors – 아티스트 기반 situation 가중치
# ---------------------------------------------------------------------------

_ARTIST_SITUATION_PRIOR: dict[str, list[str]] = {
    "the weeknd": ["late_night", "night_drive"],
    "dua lipa": ["party", "workout"],
    "harry styles": ["walk", "commute"],
    "justin bieber": ["commute", "walk"],
    "taylor swift": ["commute", "walk", "rain"],
    "olivia rodrigo": ["night_drive", "rain"],
    "billie eilish": ["late_night", "night_drive"],
    "ariana grande": ["party", "workout"],
    "bruno mars": ["party", "commute"],
    "drake": ["night_drive", "late_night"],
    "travis scott": ["night_drive", "party"],
    "lana del rey": ["night_drive", "late_night", "rain"],
    "frank ocean": ["late_night", "night_drive"],
    "sza": ["late_night", "night_drive"],
    "kendrick lamar": ["workout", "commute"],
    "bts": ["workout", "party", "commute"],
    "blackpink": ["workout", "party"],
    "iu": ["cafe", "rain", "walk"],
    "dean": ["late_night", "night_drive"],
    "crush": ["late_night", "cafe"],
    "heize": ["rain", "late_night"],
    "newjeans": ["commute", "walk"],
    "aespa": ["workout", "party"],
}

# ---------------------------------------------------------------------------
# [2] High-precision situations – 엄격한 검출 조건
# ---------------------------------------------------------------------------

_HIGH_PRECISION_SITUATIONS = {"cooking", "study", "sleep", "cafe", "morning"}

# cooking/study/sleep/cafe/morning을 허용하는 mood
_PRECISION_ALLOW_MOODS: dict[str, set[str]] = {
    "cooking": {"chill", "peaceful", "soft"},
    "study": {"chill", "peaceful", "dreamy", "soft"},
    "sleep": {"peaceful", "dreamy", "soft", "chill"},
    "cafe": {"chill", "romantic", "peaceful", "nostalgic", "soft"},
    "morning": {"peaceful", "happy", "soft"},
}

# cooking/study/sleep/cafe/morning을 허용하는 genre
_PRECISION_ALLOW_GENRES: dict[str, set[str]] = {
    "cooking": {"acoustic", "lofi", "jazz"},
    "study": {"lofi", "classical", "ambient", "acoustic", "jazz"},
    "sleep": {"ambient", "classical", "lofi", "acoustic"},
    "cafe": {"jazz", "acoustic", "indie", "lofi", "ballad"},
    "morning": {"acoustic", "indie", "lofi", "pop"},
}

# cooking/study/sleep/cafe/morning을 차단하는 mood
_PRECISION_BLOCK_MOODS: dict[str, set[str]] = {
    "cooking": {"energetic", "dark", "intense", "sexy"},
    "study": {"energetic", "intense", "sexy"},
    "sleep": {"energetic", "intense", "sexy", "happy"},
    "cafe": {"intense", "dark"},
    "morning": {"dark", "intense", "sexy"},
}

# ---------------------------------------------------------------------------
# [4] Situation conflict penalties
# ---------------------------------------------------------------------------

_SITUATION_CONFLICTS: dict[str, list[str]] = {
    "night_drive": ["cooking", "morning", "study"],
    "party": ["sleep", "study", "reading", "cooking"],
    "workout": ["sleep", "cooking", "reading", "cafe"],
    "late_night": ["morning", "cooking"],
}

_MOOD_SUPPRESSES_SITUATION: dict[str, list[str]] = {
    "dark": ["cooking", "morning"],
    "intense": ["cooking", "sleep", "morning", "cafe"],
    "energetic": ["sleep", "cooking"],
    "sexy": ["cooking", "morning", "study"],
}

# ---------------------------------------------------------------------------
# Hangul detection helper
# ---------------------------------------------------------------------------

def _contains_hangul(text: str) -> bool:
    for ch in text:
        if "\uac00" <= ch <= "\ud7a3" or "\u3131" <= ch <= "\u3163" or "\u1100" <= ch <= "\u11ff":
            return True
    return False


def _contains_latin(text: str) -> bool:
    for ch in text:
        if ("A" <= ch <= "Z") or ("a" <= ch <= "z"):
            return True
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_language(texts: list[str]) -> str:
    has_hangul = False
    has_latin = False
    for text in texts:
        if _contains_hangul(text):
            has_hangul = True
        if _contains_latin(text):
            has_latin = True
        if has_hangul and has_latin:
            return Language.MIXED.value
    if has_hangul:
        return Language.KOREAN.value
    return Language.ENGLISH.value


def detect_genres(artists: list[str], titles: list[str]) -> list[str]:
    genre_counter: Counter[str] = Counter()

    artist_lower_map = {k.lower(): v for k, v in _get_artist_genre_map().items()}
    for artist in artists:
        key = artist.strip().lower()
        if key in artist_lower_map:
            val = artist_lower_map[key]
            genres_for_artist = val if isinstance(val, list) else [val]
            for genre in genres_for_artist:
                genre_counter[genre] += 1

    combined_text = " ".join(t.lower() for t in titles)
    for genre, keywords in _get_genre_keywords().items():
        for kw in keywords:
            if kw.lower() in combined_text:
                genre_counter[genre] += 1

    valid_genres = {g.value for g in Genre}
    detected = [
        genre for genre, _ in genre_counter.most_common()
        if genre in valid_genres
    ]
    return detected


def detect_moods(titles: list[str], genres: list[str]) -> list[str]:
    mood_counter: Counter[str] = Counter()

    combined_text = " ".join(t.lower() for t in titles)
    for mood, keywords in _get_mood_keywords().items():
        for kw in keywords:
            if kw.lower() in combined_text:
                mood_counter[mood] += 1

    for genre in genres:
        correlated_moods = _GENRE_MOOD_CORRELATION.get(genre, [])
        for m in correlated_moods:
            mood_counter[m] += 1

    valid_moods = {m.value for m in Mood}
    detected = [
        mood for mood, _ in mood_counter.most_common()
        if mood in valid_moods
    ]
    return detected


def detect_situations(
    titles: list[str],
    moods: list[str],
    genres: list[str] | None = None,
    artists: list[str] | None = None,
) -> list[str]:
    """Detect situations with precision filtering and conflict penalties.

    Improvements over naive version:
    - High-precision mode for daily-life tags (cooking, study, sleep, etc.)
    - Artist-based situation priors
    - Conflict penalties between contradictory situations
    - Output capped at top 3
    """
    genres = genres or []
    artists = artists or []
    situation_counter: Counter[str] = Counter()

    # --- 1. Title keyword scanning ---
    combined_text = " ".join(t.lower() for t in titles)
    for situation, keywords in _get_situation_keywords().items():
        for kw in keywords:
            if kw.lower() in combined_text:
                situation_counter[situation] += 1

    # --- 2. Mood-situation correlation ---
    for mood in moods:
        correlated_situations = _MOOD_SITUATION_CORRELATION.get(mood, [])
        for s in correlated_situations:
            situation_counter[s] += 1

    # --- 3. Artist situation priors (weight=2 each) ---
    for artist in artists:
        key = artist.strip().lower()
        priors = _ARTIST_SITUATION_PRIOR.get(key, [])
        for s in priors:
            situation_counter[s] += 2

    # --- 4. High-precision gate for daily-life situations ---
    mood_set = set(moods)
    genre_set = set(genres)
    to_remove: list[str] = []

    for sit in _HIGH_PRECISION_SITUATIONS:
        if sit not in situation_counter:
            continue

        allow_moods = _PRECISION_ALLOW_MOODS.get(sit, set())
        allow_genres = _PRECISION_ALLOW_GENRES.get(sit, set())
        block_moods = _PRECISION_BLOCK_MOODS.get(sit, set())

        has_allow_mood = bool(mood_set & allow_moods)
        has_allow_genre = bool(genre_set & allow_genres)
        has_block_mood = bool(mood_set & block_moods)

        # Block if blocking moods present
        if has_block_mood:
            to_remove.append(sit)
            continue

        # Need at least one allowing mood AND one allowing genre
        if not (has_allow_mood and has_allow_genre):
            to_remove.append(sit)
            continue

    for sit in to_remove:
        del situation_counter[sit]

    # --- 5. Conflict penalties ---
    for strong_sit, weak_sits in _SITUATION_CONFLICTS.items():
        if strong_sit in situation_counter and situation_counter[strong_sit] >= 2:
            for weak in weak_sits:
                if weak in situation_counter:
                    situation_counter[weak] = max(0, situation_counter[weak] - 3)
                    if situation_counter[weak] <= 0:
                        del situation_counter[weak]

    # Mood-based suppression
    for mood in moods[:3]:  # top 3 moods only
        suppressed = _MOOD_SUPPRESSES_SITUATION.get(mood, [])
        for sit in suppressed:
            if sit in situation_counter:
                situation_counter[sit] = max(0, situation_counter[sit] - 2)
                if situation_counter[sit] <= 0:
                    del situation_counter[sit]

    # --- 6. Validate and cap at top 3 ---
    valid_situations = {s.value for s in Situation}
    detected = [
        situation for situation, cnt in situation_counter.most_common(3)
        if situation in valid_situations and cnt > 0
    ]

    # Ensure at least 1 result
    if not detected:
        if genres and genres[0] == "pop":
            detected = ["commute"]
        else:
            detected = ["study"]

    return detected


def build_keyword_pool(
    genres: list[str],
    moods: list[str],
    situations: list[str],
    artists: list[str],
    language: str,
) -> list[str]:
    pool: list[str] = []
    seen: set[str] = set()

    for item in genres + moods + situations:
        if item not in seen:
            pool.append(item)
            seen.add(item)

    for artist in artists[:5]:
        normalized = artist.strip()
        if normalized and normalized not in seen:
            pool.append(normalized)
            seen.add(normalized)

    if language and language not in seen:
        pool.append(language)
        seen.add(language)

    return pool


def analyze_playlist(playlist: PlaylistData) -> AnalysisResult:
    artists: list[str] = [track.artist for track in playlist.tracks]
    titles: list[str] = [track.title for track in playlist.tracks]

    artist_counter = Counter(a.strip() for a in artists if a.strip())
    top_artists = [artist for artist, _ in artist_counter.most_common(5)]

    all_texts = titles + artists
    language = detect_language(all_texts)

    genres = detect_genres(artists, titles)
    moods = detect_moods(titles, genres)
    situations = detect_situations(titles, moods, genres, artists)

    primary_genre = genres[0] if genres else Genre.POP.value
    primary_mood = moods[0] if moods else Mood.CHILL.value
    primary_situation = situations[0] if situations else Situation.STUDY.value

    keyword_pool = build_keyword_pool(genres, moods, situations, top_artists, language)

    return AnalysisResult(
        detected_genres=genres,
        detected_moods=moods,
        detected_situations=situations,
        primary_genre=primary_genre,
        primary_mood=primary_mood,
        primary_situation=primary_situation,
        language=language,
        top_artists=top_artists,
        keyword_pool=keyword_pool,
    )
