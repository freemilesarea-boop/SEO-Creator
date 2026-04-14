from pydantic import BaseModel, Field
from enum import Enum


# ── Enums ──

class Genre(str, Enum):
    KPOP = "kpop"
    POP = "pop"
    RNB = "rnb"
    HIPHOP = "hiphop"
    LOFI = "lofi"
    JAZZ = "jazz"
    ROCK = "rock"
    EDM = "edm"
    CLASSICAL = "classical"
    INDIE = "indie"
    BALLAD = "ballad"
    ACOUSTIC = "acoustic"
    LATIN = "latin"
    JPOP = "jpop"
    OST = "ost"


class Mood(str, Enum):
    CHILL = "chill"
    EMOTIONAL = "emotional"
    ENERGETIC = "energetic"
    DREAMY = "dreamy"
    SEXY = "sexy"
    HAPPY = "happy"
    SAD = "sad"
    DARK = "dark"
    ROMANTIC = "romantic"
    NOSTALGIC = "nostalgic"
    PEACEFUL = "peaceful"
    INTENSE = "intense"


class Situation(str, Enum):
    STUDY = "study"
    NIGHT_DRIVE = "night_drive"
    WORKOUT = "workout"
    CAFE = "cafe"
    SLEEP = "sleep"
    MORNING = "morning"
    RAIN = "rain"
    COMMUTE = "commute"
    PARTY = "party"
    COOKING = "cooking"
    READING = "reading"
    WALK = "walk"


class Language(str, Enum):
    KOREAN = "ko"
    ENGLISH = "en"
    MIXED = "mixed"


# ── Request Models ──

class LinkInput(BaseModel):
    """링크 기반 자동 생성 요청"""
    url: str = Field(..., description="YouTube/YouTube Music 재생목록 URL")
    language: Language = Field(default=Language.KOREAN, description="출력 언어")
    override_genre: Genre | None = Field(default=None, description="장르 수동 보정")
    override_mood: Mood | None = Field(default=None, description="분위기 수동 보정")
    override_situation: Situation | None = Field(default=None, description="상황 수동 보정")
    exclude_keywords: list[str] = Field(default_factory=list, description="금지 키워드")


class ManualInput(BaseModel):
    """수동 입력 기반 생성 요청"""
    genre: Genre = Field(..., description="장르")
    mood: Mood = Field(..., description="분위기")
    situation: Situation = Field(..., description="상황")
    language: Language = Field(default=Language.KOREAN, description="출력 언어")
    emotion: str = Field(default="", description="감성 키워드 (자유 입력)")
    reference_artists: list[str] = Field(default_factory=list, description="참고 아티스트")
    exclude_keywords: list[str] = Field(default_factory=list, description="금지 키워드")


# ── Track / Analysis Models ──

class TrackInfo(BaseModel):
    title: str
    artist: str
    duration_seconds: int | None = None


class PlaylistData(BaseModel):
    playlist_title: str
    track_count: int
    tracks: list[TrackInfo]


class AnalysisResult(BaseModel):
    detected_genres: list[str]
    detected_moods: list[str]
    detected_situations: list[str]
    primary_genre: str
    primary_mood: str
    primary_situation: str
    language: str
    top_artists: list[str]
    keyword_pool: list[str]


# ── SEO Scoring ──

class KeywordScore(BaseModel):
    keyword: str
    relevance: float = Field(ge=0, le=1)
    search_intent: float = Field(ge=0, le=1)
    mood_match: float = Field(ge=0, le=1)
    genre_match: float = Field(ge=0, le=1)
    spam_risk: float = Field(ge=0, le=1)
    total_score: float = Field(ge=0, le=1)


# ── Output Models ──

class ThumbnailSuggestion(BaseModel):
    main_keywords: list[str] = Field(description="메인 검색 키워드")
    sub_keywords: list[str] = Field(description="보조 키워드")
    color_tone: list[str] = Field(description="컬러톤 추천")
    background_concept: str = Field(description="배경 콘셉트")
    has_person: bool = Field(description="인물 포함 여부")
    layout: str = Field(description="레이아웃 제안")
    text_overlay: str = Field(description="텍스트 오버레이 문구")


class ResultSet(BaseModel):
    """하나의 결과 세트"""
    set_label: str = Field(description="세트 라벨 (예: 감성형, 검색형, 클릭형)")
    yt_music_title: str = Field(description="YouTube Music 재생목록 제목")
    yt_playlist_title: str = Field(description="YouTube Playlist 제목")
    thumbnail: ThumbnailSuggestion
    seo_score: float = Field(ge=0, le=100, description="SEO 점수 (0~100)")


class GenerationResponse(BaseModel):
    """최종 생성 결과"""
    analysis: AnalysisResult
    keyword_scores: list[KeywordScore]
    results: list[ResultSet] = Field(description="최소 3세트 결과")
    generation_id: str = Field(description="결과 고유 ID (재생성용)")
