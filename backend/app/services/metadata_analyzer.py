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
    # Try both top-level genre_keywords and nested genres.*.ko/en_keywords
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
# Genre-mood and mood-situation correlations
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

_MOOD_SITUATION_CORRELATION: dict[str, list[str]] = {
    "chill": ["study", "cafe", "reading"],
    "emotional": ["rain", "night_drive", "sleep"],
    "energetic": ["workout", "party", "commute"],
    "dreamy": ["sleep", "night_drive", "reading"],
    "sexy": ["night_drive", "party"],
    "happy": ["morning", "walk", "cooking"],
    "sad": ["rain", "sleep", "night_drive"],
    "dark": ["night_drive", "workout"],
    "romantic": ["cafe", "cooking", "walk"],
    "nostalgic": ["rain", "cafe", "walk"],
    "peaceful": ["morning", "reading", "walk"],
    "intense": ["workout", "party", "commute"],
}


# ---------------------------------------------------------------------------
# Hangul detection helper
# ---------------------------------------------------------------------------

def _contains_hangul(text: str) -> bool:
    """Return True if the text contains any Hangul characters."""
    for ch in text:
        if "\uac00" <= ch <= "\ud7a3" or "\u3131" <= ch <= "\u3163" or "\u1100" <= ch <= "\u11ff":
            return True
    return False


def _contains_latin(text: str) -> bool:
    """Return True if the text contains Latin alphabet characters."""
    for ch in text:
        if ("A" <= ch <= "Z") or ("a" <= ch <= "z"):
            return True
    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_language(texts: list[str]) -> str:
    """Detect whether the texts are Korean, English, or mixed.

    Checks for the presence of Hangul characters vs Latin characters
    across all provided texts.

    Returns:
        One of Language enum values: "ko", "en", or "mixed".
    """
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
    """Detect genres from artist names and track titles.

    Strategy:
    1. Look up each artist in the artist_genre_map.
    2. Scan track titles for genre-specific keywords from genre_keywords.
    3. Aggregate and rank by frequency.

    Returns:
        List of genre strings ordered by frequency (most common first).
    """
    genre_counter: Counter[str] = Counter()

    # --- Artist-based genre detection ---
    artist_lower_map = {k.lower(): v for k, v in _get_artist_genre_map().items()}
    for artist in artists:
        key = artist.strip().lower()
        if key in artist_lower_map:
            val = artist_lower_map[key]
            # Handle both string ("kpop") and list (["kpop", "pop"]) values
            genres_for_artist = val if isinstance(val, list) else [val]
            for genre in genres_for_artist:
                genre_counter[genre] += 1

    # --- Title keyword-based genre detection ---
    combined_text = " ".join(t.lower() for t in titles)
    for genre, keywords in _get_genre_keywords().items():
        for kw in keywords:
            if kw.lower() in combined_text:
                genre_counter[genre] += 1

    # Validate against Genre enum values and return sorted by frequency
    valid_genres = {g.value for g in Genre}
    detected = [
        genre for genre, _ in genre_counter.most_common()
        if genre in valid_genres
    ]
    return detected


def detect_moods(titles: list[str], genres: list[str]) -> list[str]:
    """Detect moods from track titles and correlated genres.

    Strategy:
    1. Scan titles for mood-related keywords (Korean and English).
    2. Add correlated moods from detected genres.
    3. Aggregate and rank by frequency.

    Returns:
        List of mood strings ordered by frequency (most common first).
    """
    mood_counter: Counter[str] = Counter()

    # --- Title keyword scanning ---
    combined_text = " ".join(t.lower() for t in titles)
    for mood, keywords in _get_mood_keywords().items():
        for kw in keywords:
            if kw.lower() in combined_text:
                mood_counter[mood] += 1

    # --- Genre-mood correlation ---
    for genre in genres:
        correlated_moods = _GENRE_MOOD_CORRELATION.get(genre, [])
        for m in correlated_moods:
            mood_counter[m] += 1

    # Validate against Mood enum values
    valid_moods = {m.value for m in Mood}
    detected = [
        mood for mood, _ in mood_counter.most_common()
        if mood in valid_moods
    ]
    return detected


def detect_situations(titles: list[str], moods: list[str]) -> list[str]:
    """Detect situations from track titles and correlated moods.

    Strategy:
    1. Scan titles for situation-related keywords.
    2. Add correlated situations from detected moods.
    3. Aggregate and rank by frequency.

    Returns:
        List of situation strings ordered by frequency (most common first).
    """
    situation_counter: Counter[str] = Counter()

    # --- Title keyword scanning ---
    combined_text = " ".join(t.lower() for t in titles)
    for situation, keywords in _get_situation_keywords().items():
        for kw in keywords:
            if kw.lower() in combined_text:
                situation_counter[situation] += 1

    # --- Mood-situation correlation ---
    for mood in moods:
        correlated_situations = _MOOD_SITUATION_CORRELATION.get(mood, [])
        for s in correlated_situations:
            situation_counter[s] += 1

    # Validate against Situation enum values
    valid_situations = {s.value for s in Situation}
    detected = [
        situation for situation, _ in situation_counter.most_common()
        if situation in valid_situations
    ]
    return detected


def build_keyword_pool(
    genres: list[str],
    moods: list[str],
    situations: list[str],
    artists: list[str],
    language: str,
) -> list[str]:
    """Combine all detected elements into a ranked keyword pool.

    The pool is ordered by category priority: genres first, then moods,
    situations, top artists, and finally the language tag. Duplicates
    are removed while preserving order.

    Returns:
        Deduplicated list of keyword strings.
    """
    pool: list[str] = []
    seen: set[str] = set()

    for item in genres + moods + situations:
        if item not in seen:
            pool.append(item)
            seen.add(item)

    # Add top artists (up to 5, already pre-sliced by caller but guard here)
    for artist in artists[:5]:
        normalized = artist.strip()
        if normalized and normalized not in seen:
            pool.append(normalized)
            seen.add(normalized)

    # Add language tag
    if language and language not in seen:
        pool.append(language)
        seen.add(language)

    return pool


def analyze_playlist(playlist: PlaylistData) -> AnalysisResult:
    """Main analysis function.

    Analyzes all tracks in a playlist to detect genre, mood, situation,
    and language, then returns a comprehensive AnalysisResult.

    Args:
        playlist: Parsed playlist data containing track information.

    Returns:
        AnalysisResult with detected attributes and primary selections.
    """
    # -- Extract all artist names and track titles --
    artists: list[str] = [track.artist for track in playlist.tracks]
    titles: list[str] = [track.title for track in playlist.tracks]

    # -- Find top repeated artists (up to 5) --
    artist_counter = Counter(a.strip() for a in artists if a.strip())
    top_artists = [artist for artist, _ in artist_counter.most_common(5)]

    # -- Detect language --
    all_texts = titles + artists
    language = detect_language(all_texts)

    # -- Detect genres --
    genres = detect_genres(artists, titles)

    # -- Detect moods (uses detected genres for correlation) --
    moods = detect_moods(titles, genres)

    # -- Detect situations (uses detected moods for correlation) --
    situations = detect_situations(titles, moods)

    # -- Primary values = highest frequency (first element) --
    primary_genre = genres[0] if genres else Genre.POP.value
    primary_mood = moods[0] if moods else Mood.CHILL.value
    primary_situation = situations[0] if situations else Situation.STUDY.value

    # -- Build keyword pool --
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
