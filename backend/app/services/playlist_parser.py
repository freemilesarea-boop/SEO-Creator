"""Playlist parser service for extracting track info from YouTube/YouTube Music playlists."""

import asyncio
import logging
import re
from functools import partial
from urllib.parse import parse_qs, urlparse

import yt_dlp

from backend.app.models.schemas import PlaylistData, TrackInfo

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supported hostname patterns
# ---------------------------------------------------------------------------
_YOUTUBE_HOSTS = {
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "www.music.youtube.com",
}

_PLAYLIST_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------
class PlaylistParseError(Exception):
    """Raised when playlist parsing fails."""


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------
def validate_playlist_url(url: str) -> str | None:
    """Validate that *url* points to a YouTube / YouTube Music playlist.

    Returns the playlist ID if the URL is valid, or ``None`` otherwise.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return None

    # Must be http(s) and a recognised YouTube host
    if parsed.scheme not in ("http", "https"):
        return None
    if parsed.hostname not in _YOUTUBE_HOSTS:
        return None

    # The playlist ID lives in the ``list`` query parameter
    qs = parse_qs(parsed.query)
    playlist_ids = qs.get("list")
    if not playlist_ids:
        return None

    playlist_id = playlist_ids[0]
    if not playlist_id or not _PLAYLIST_ID_RE.match(playlist_id):
        return None

    return playlist_id


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _parse_artist_title(raw_title: str) -> tuple[str, str]:
    """Best-effort split of ``"Artist - Title"`` formatted strings.

    Returns ``(artist, title)``.  When the string does not contain a
    recognisable separator the full string is used as the title and the
    artist is set to ``"Unknown"``.
    """
    # Common separators used in YouTube music titles
    for separator in (" - ", " – ", " — ", " | "):
        if separator in raw_title:
            parts = raw_title.split(separator, maxsplit=1)
            artist = parts[0].strip()
            title = parts[1].strip()
            if artist and title:
                return artist, title

    return "Unknown", raw_title.strip()


def _extract_playlist_sync(url: str, playlist_id: str) -> PlaylistData:
    """Run yt-dlp extraction synchronously (meant to be called in a thread)."""

    ydl_opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,          # flat playlist – metadata only
        "skip_download": True,
        "ignoreerrors": True,           # skip unavailable videos
        "no_color": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        raise PlaylistParseError(
            f"yt-dlp could not extract playlist '{playlist_id}': {exc}"
        ) from exc
    except Exception as exc:
        raise PlaylistParseError(
            f"Unexpected error while extracting playlist '{playlist_id}': {exc}"
        ) from exc

    if info is None:
        raise PlaylistParseError(
            f"yt-dlp returned no data for playlist '{playlist_id}'. "
            "The playlist may be private or unavailable."
        )

    entries = info.get("entries") or []
    # entries may be a generator in some yt-dlp versions; materialise it.
    entries = list(entries)

    if not entries:
        raise PlaylistParseError(
            f"Playlist '{playlist_id}' is empty or contains no accessible tracks."
        )

    tracks: list[TrackInfo] = []
    for entry in entries:
        if entry is None:
            # yt-dlp sets entry to None when ignoreerrors skips a video
            continue

        raw_title: str = entry.get("title") or "Unknown"
        artist: str | None = (
            entry.get("artist")
            or entry.get("creator")
            or entry.get("uploader")
        )
        duration: int | None = None

        raw_duration = entry.get("duration")
        if raw_duration is not None:
            try:
                duration = int(float(raw_duration))
            except (TypeError, ValueError):
                duration = None

        # If yt-dlp gave us an artist, use it; otherwise try to parse from
        # the title string (very common for user-uploaded content).
        if artist and artist != raw_title:
            title = raw_title
        else:
            artist, title = _parse_artist_title(raw_title)

        tracks.append(
            TrackInfo(
                title=title,
                artist=artist,
                duration_seconds=duration,
            )
        )

    playlist_title: str = info.get("title") or f"Playlist {playlist_id}"

    return PlaylistData(
        playlist_title=playlist_title,
        track_count=len(tracks),
        tracks=tracks,
    )


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------
async def parse_playlist(url: str) -> PlaylistData:
    """Parse a YouTube / YouTube Music playlist URL and return track data.

    Raises :class:`PlaylistParseError` on any failure (bad URL, private
    playlist, network error, etc.).
    """
    url = url.strip()

    playlist_id = validate_playlist_url(url)
    if playlist_id is None:
        raise PlaylistParseError(
            f"Invalid or unsupported playlist URL: {url}"
        )

    # Normalise to canonical playlist URL so yt-dlp always treats it as a
    # playlist rather than a single video.
    canonical_url = f"https://www.youtube.com/playlist?list={playlist_id}"

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(_extract_playlist_sync, canonical_url, playlist_id),
        )
    except PlaylistParseError:
        raise
    except Exception as exc:
        raise PlaylistParseError(
            f"Failed to parse playlist: {exc}"
        ) from exc

    logger.info(
        "Parsed playlist '%s' – %d tracks",
        result.playlist_title,
        result.track_count,
    )
    return result
