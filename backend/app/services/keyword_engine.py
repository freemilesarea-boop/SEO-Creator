"""
SEO 키워드 추론 엔진 + SEO 점수 산정

기능:
- 분석 결과 기반 SEO 키워드 생성
- 장르/상황 조합 키워드 생성
- 한국어/영어 병행 생성
- 키워드별 SEO 점수 산정
"""

import json
from pathlib import Path
from itertools import product as iter_product

from backend.app.models.schemas import (
    AnalysisResult,
    KeywordScore,
    Language,
)

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_dict_cache: dict | None = None


def _load_dictionary() -> dict:
    global _dict_cache
    if _dict_cache is None:
        with open(_DATA_DIR / "keyword_dictionary.json", encoding="utf-8") as f:
            _dict_cache = json.load(f)
    return _dict_cache


# ── 키워드 수집 ──


def _collect_genre_keywords(genre: str, lang: str) -> list[str]:
    d = _load_dictionary()
    entry = d.get("genres", {}).get(genre, {})
    if lang == "en":
        return entry.get("en_keywords", [])
    return entry.get("ko_keywords", [])


def _collect_mood_keywords(mood: str, lang: str) -> list[str]:
    d = _load_dictionary()
    entry = d.get("moods", {}).get(mood, {})
    if lang == "en":
        return entry.get("en_keywords", [])
    return entry.get("ko_keywords", [])


def _collect_situation_keywords(situation: str, lang: str) -> list[str]:
    d = _load_dictionary()
    entry = d.get("situations", {}).get(situation, {})
    if lang == "en":
        return entry.get("en_keywords", [])
    return entry.get("ko_keywords", [])


def collect_keywords(analysis: AnalysisResult) -> list[str]:
    """분석 결과에서 모든 관련 키워드를 수집한다."""
    lang = analysis.language
    keywords: list[str] = []

    for g in analysis.detected_genres:
        keywords.extend(_collect_genre_keywords(g, lang))
    for m in analysis.detected_moods:
        keywords.extend(_collect_mood_keywords(m, lang))
    for s in analysis.detected_situations:
        keywords.extend(_collect_situation_keywords(s, lang))

    # 아티스트 이름도 키워드로 포함
    keywords.extend(analysis.top_artists[:3])

    # keyword_pool 에서 추가
    keywords.extend(analysis.keyword_pool)

    # 중복 제거 (순서 유지)
    seen: set[str] = set()
    unique: list[str] = []
    for kw in keywords:
        low = kw.lower().strip()
        if low and low not in seen:
            seen.add(low)
            unique.append(kw.strip())
    return unique


# ── 조합 키워드 생성 ──


def generate_combination_keywords(analysis: AnalysisResult) -> list[str]:
    """장르 + 상황, 분위기 + 장르 등 조합 키워드를 만든다."""
    lang = analysis.language
    combos: list[str] = []

    genre_kw = _collect_genre_keywords(analysis.primary_genre, lang)[:3]
    mood_kw = _collect_mood_keywords(analysis.primary_mood, lang)[:3]
    sit_kw = _collect_situation_keywords(analysis.primary_situation, lang)[:3]

    # 2종 조합
    for g, m in iter_product(genre_kw[:2], mood_kw[:2]):
        combos.append(f"{m} {g}")
    for g, s in iter_product(genre_kw[:2], sit_kw[:2]):
        combos.append(f"{s} {g}")
    for m, s in iter_product(mood_kw[:2], sit_kw[:2]):
        combos.append(f"{s} {m}")

    return list(dict.fromkeys(combos))  # 중복 제거


# ── 키워드 유형 분류 ──


_GENERIC_HEAD_WORDS = {
    "노래", "음악", "추천", "모음", "플레이리스트", "듣기",
    "songs", "music", "playlist", "mix", "best", "top",
    "팝송", "노래 추천", "음악 추천",
}


def classify_keyword(keyword: str) -> str:
    """키워드를 head / mid-tail / long-tail로 분류.

    - head: 1~2어절 또는 너무 범용적
    - mid-tail: 3~4어절, 장르+상황 조합
    - long-tail: 5어절 이상, 구체적 use-case 포함
    """
    words = keyword.split()
    word_count = len(words)
    low = keyword.lower()

    # 영어 1~2 단어 단독 = head
    if word_count <= 2:
        return "head"

    # 너무 범용적인 단어로만 구성
    generic_count = sum(1 for w in words if w in _GENERIC_HEAD_WORDS)
    if generic_count >= word_count - 1:
        return "head"

    # 한국어 글자 수 기반 보조 판단
    char_count = len(keyword.replace(" ", ""))
    if char_count <= 6:
        return "head"

    if word_count >= 5 or char_count >= 18:
        return "long-tail"

    return "mid-tail"


def competition_score(keyword: str) -> float:
    """경쟁도 추정 (0=낮음/좋음, 1=높음/나쁨).

    높은 값 = 경쟁 치열 = 패널티 대상
    """
    kw_type = classify_keyword(keyword)
    low = keyword.lower()

    score = 0.0

    # 유형별 기본 경쟁도
    if kw_type == "head":
        score = 0.8
    elif kw_type == "mid-tail":
        score = 0.4
    else:  # long-tail
        score = 0.15

    # 범용 단어가 많으면 경쟁 up
    words = keyword.split()
    generic_count = sum(1 for w in words if w in _GENERIC_HEAD_WORDS)
    score += generic_count * 0.1

    # 너무 짧으면 경쟁 up
    if len(keyword.replace(" ", "")) <= 8:
        score += 0.15

    return min(1.0, score)


# ── 롱테일 키워드 ──


_LONGTAIL_KO_TEMPLATES = [
    "{m} {g} 추천",
    "{s} {g} 노래 모음",
    "{s} 분위기에 딱 맞는 {g} 플레이리스트",
    "{m} 느낌의 {g} 노래 추천",
    "{s} 분위기 {g} 모음",
    "{m} {g} | {s} 플레이리스트",
]

_LONGTAIL_EN_TEMPLATES = [
    "{m} {g} for {s}",
    "best {m} {g} playlist",
    "{g} songs for {s}",
    "{m} {g} mix for {s}",
    "{g} playlist for {s} – {m} vibes",
    "the best {g} to listen during {s}",
    "{m} {g} collection | perfect for {s}",
    "{g} you need for {s} | {m} edition",
    "{s} {g} playlist – {m} and chill",
    "top {m} {g} tracks for your {s}",
]

# situation별 구체적 context 키워드
_SITUATION_CONTEXTS_KO: dict[str, list[str]] = {
    "workout": ["헬스장에서", "러닝할 때", "운동할 때", "웨이트할 때"],
    "study": ["공부할 때", "도서관에서", "시험기간에", "집중할 때"],
    "night_drive": ["밤 드라이브할 때", "야간 운전할 때", "새벽 드라이브에서"],
    "cafe": ["카페에서", "커피숍에서", "카페 배경음악으로"],
    "sleep": ["잠잘 때", "자기 전에", "수면용으로"],
    "rain": ["비 오는 날에", "비 오는 밤에", "장마철에"],
    "late_night": ["새벽에", "밤에 혼자", "심야에"],
    "morning": ["아침에", "기상할 때", "출근 전에"],
    "party": ["파티할 때", "클럽에서", "불금에"],
    "walk": ["산책할 때", "걸을 때", "조깅할 때"],
    "commute": ["출퇴근할 때", "지하철에서", "버스에서"],
}

_SITUATION_CONTEXTS_EN: dict[str, list[str]] = {
    "workout": ["at the gym", "while running", "during training"],
    "study": ["while studying", "at the library", "during exam prep"],
    "night_drive": ["on a late night drive", "driving at midnight"],
    "cafe": ["at a coffee shop", "cafe background music"],
    "sleep": ["before bed", "for deep sleep"],
    "rain": ["on a rainy day", "rainy night"],
    "late_night": ["at 3am", "late at night"],
    "morning": ["in the morning", "to start your day"],
    "party": ["at the party", "club night"],
}


def generate_longtail_keywords(analysis: AnalysisResult) -> list[str]:
    """구체적 use-case 기반 long-tail 검색어 생성."""
    lang = analysis.language
    genre = analysis.primary_genre
    mood = analysis.primary_mood
    situation = analysis.primary_situation

    g_kw = _collect_genre_keywords(genre, lang)
    m_kw = _collect_mood_keywords(mood, lang)
    s_kw = _collect_situation_keywords(situation, lang)

    g = g_kw[0] if g_kw else genre
    m = m_kw[0] if m_kw else mood
    s = s_kw[0] if s_kw else situation

    results: list[str] = []

    if lang == "ko":
        for tmpl in _LONGTAIL_KO_TEMPLATES:
            results.append(tmpl.format(g=g, m=m, s=s))
        # situation-specific context → 자연어 long-tail 핵심
        contexts = _SITUATION_CONTEXTS_KO.get(situation, [])
        for ctx in contexts:
            results.append(f"{ctx} 듣기 좋은 {g}")
            results.append(f"{ctx} 듣는 {m} {g} 모음")
            results.append(f"{ctx} 듣기 좋은 {g} 플레이리스트")
            results.append(f"{ctx} 분위기 미치는 {g}")
    else:
        for tmpl in _LONGTAIL_EN_TEMPLATES:
            results.append(tmpl.format(g=g, m=m, s=s))
        contexts = _SITUATION_CONTEXTS_EN.get(situation, [])
        for ctx in contexts:
            results.append(f"{g} playlist {ctx}")
            results.append(f"best {m} {g} {ctx}")
            results.append(f"{m} {g} songs {ctx}")

    # 중복 제거
    seen: set[str] = set()
    unique: list[str] = []
    for r in results:
        if r.lower() not in seen:
            seen.add(r.lower())
            unique.append(r)

    return unique


# ── SEO 점수 산정 ──


def _get_display_names(analysis: AnalysisResult) -> set[str]:
    """language_variants에서 genre/mood/situation의 표시명을 수집한다."""
    d = _load_dictionary()
    names: set[str] = set()
    lang = analysis.language if analysis.language in ("ko", "en") else "ko"

    lv = d.get("language_variants", {}).get(lang, {})

    gd = lv.get("genre_display", {})
    if analysis.primary_genre in gd:
        names.add(gd[analysis.primary_genre].lower())
    md = lv.get("mood_display", {})
    if analysis.primary_mood in md:
        names.add(md[analysis.primary_mood].lower())
    sd = lv.get("situation_display", {})
    if analysis.primary_situation in sd:
        names.add(sd[analysis.primary_situation].lower())

    # ko_keywords 첫 번째 값도 추가
    for section, key in [
        ("genres", analysis.primary_genre),
        ("moods", analysis.primary_mood),
        ("situations", analysis.primary_situation),
    ]:
        entry = d.get(section, {}).get(key, {})
        for kw in entry.get("ko_keywords", [])[:2]:
            names.add(kw.lower())
        for kw in entry.get("en_keywords", [])[:2]:
            names.add(kw.lower())

    return names


def _relevance_score(keyword: str, analysis: AnalysisResult) -> float:
    """키워드가 분석 결과와 얼마나 관련 있는지 0~1 점수."""
    low = keyword.lower()
    score = 0.0
    pool_lower = [k.lower() for k in analysis.keyword_pool]

    if low in pool_lower:
        score += 0.4

    # 장르/무드/상황 직접 언급 (영문 enum)
    if analysis.primary_genre.lower() in low:
        score += 0.2
    if analysis.primary_mood.lower() in low:
        score += 0.2
    if analysis.primary_situation.replace("_", " ").lower() in low:
        score += 0.2

    # 한국어/영어 표시명 매칭
    if score < 0.6:
        display_names = _get_display_names(analysis)
        for name in display_names:
            if name in low or low in name:
                score += 0.3
                break

    return min(score, 1.0)


def _search_intent_score(keyword: str) -> float:
    """검색 의도 적합도 – 키워드 길이·구성으로 추정."""
    words = keyword.split()
    if len(words) < 2:
        return 0.3
    if len(words) <= 4:
        return 0.8
    return 0.6  # 너무 길면 약간 감소


def _spam_risk(keyword: str) -> float:
    """낚시/과장 위험도."""
    spam_words = [
        "미쳤", "ㄹㅇ", "실화", "레전드", "충격", "극혐", "개쩌는",
        "insane", "shocking", "crazy", "you won't believe",
    ]
    low = keyword.lower()
    for w in spam_words:
        if w in low:
            return 0.8
    return 0.0


def score_keyword(keyword: str, analysis: AnalysisResult) -> KeywordScore:
    """개별 키워드 SEO 점수를 산정한다."""
    relevance = _relevance_score(keyword, analysis)
    search_intent = _search_intent_score(keyword)

    # 무드/장르 매치 – enum 영문 + 한국어 표시명 모두 검사
    mood_match = 0.0
    genre_match = 0.0
    low = keyword.lower()
    display_names = _get_display_names(analysis)

    for m in analysis.detected_moods:
        if m.lower() in low:
            mood_match = 1.0
            break
    if mood_match == 0.0:
        d = _load_dictionary()
        for m in analysis.detected_moods:
            for kw in d.get("moods", {}).get(m, {}).get("ko_keywords", [])[:3]:
                if kw.lower() in low or low in kw.lower():
                    mood_match = 0.8
                    break
            if mood_match > 0:
                break

    for g in analysis.detected_genres:
        if g.lower() in low:
            genre_match = 1.0
            break
    if genre_match == 0.0:
        d = _load_dictionary()
        for g in analysis.detected_genres:
            for kw in d.get("genres", {}).get(g, {}).get("ko_keywords", [])[:3]:
                if kw.lower() in low or low in kw.lower():
                    genre_match = 0.8
                    break
            if genre_match > 0:
                break

    if mood_match == 0.0:
        mood_match = 0.3 if relevance > 0.3 else 0.1
    if genre_match == 0.0:
        genre_match = 0.3 if relevance > 0.3 else 0.1

    spam = _spam_risk(keyword)

    total = (
        relevance * 0.30
        + search_intent * 0.25
        + mood_match * 0.15
        + genre_match * 0.15
        - spam * 0.15
    )
    total = max(0.0, min(1.0, total))

    return KeywordScore(
        keyword=keyword,
        relevance=round(relevance, 3),
        search_intent=round(search_intent, 3),
        mood_match=round(mood_match, 3),
        genre_match=round(genre_match, 3),
        spam_risk=round(spam, 3),
        total_score=round(total, 3),
    )


def score_all_keywords(
    keywords: list[str], analysis: AnalysisResult
) -> list[KeywordScore]:
    """키워드 목록 전체를 점수화하고 높은 순으로 정렬한다."""
    scored = [score_keyword(kw, analysis) for kw in keywords]
    scored.sort(key=lambda s: s.total_score, reverse=True)
    return scored
