"""
API 라우트 – SEO Creator 핵심 엔드포인트
"""

import uuid
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException

from backend.app.models.schemas import (
    LinkInput,
    ManualInput,
    GenerationResponse,
    AnalysisResult,
    ResultSet,
    ResultSetExplanation,
    TitleExplanation,
    PlaylistData,
    TrackInfo,
)
from backend.app.services.playlist_parser import parse_playlist, PlaylistParseError
from backend.app.services.metadata_analyzer import analyze_playlist
from backend.app.services.coherence import pick_compatible_mood, filter_compatible_moods
from backend.app.services.keyword_engine import (
    collect_keywords,
    generate_combination_keywords,
    generate_longtail_keywords,
    score_all_keywords,
)
from backend.app.services.title_generator import generate_title_sets
from backend.app.services.thumbnail_generator import generate_thumbnail
from backend.app.services.trends_ranker import enhance_with_trends
from backend.app.services.explainer import explain_result_set
from backend.app.models.database import async_session, GenerationHistory

router = APIRouter(prefix="/api/v1", tags=["SEO Generator"])


def _build_response(
    analysis: AnalysisResult,
    language: str,
) -> GenerationResponse:
    """분석 결과 → 키워드 점수 → 제목 → 썸네일 → 최종 응답 조립."""

    # 0) Situation-first: mood를 situation과 호환되도록 보정
    compatible_mood = pick_compatible_mood(
        analysis.primary_situation, analysis.detected_moods
    )
    analysis.primary_mood = compatible_mood
    analysis.detected_moods = filter_compatible_moods(
        analysis.primary_situation, analysis.detected_moods, max_count=3
    )

    # 1) 키워드 수집 + 조합 + 롱테일
    all_keywords = collect_keywords(analysis)
    all_keywords.extend(generate_combination_keywords(analysis))
    all_keywords.extend(generate_longtail_keywords(analysis))
    all_keywords = list(dict.fromkeys(all_keywords))  # 중복 제거

    # 2) 키워드 점수화
    keyword_scores = score_all_keywords(all_keywords, analysis)

    # 2.5) Trends 강화 (실패 시 기존 결과 유지)
    try:
        keyword_scores, trend_meta = enhance_with_trends(
            analysis, keyword_scores, language
        )
    except Exception:
        trend_meta = {
            "trend_enhanced": False,
            "trends_source": "error_fallback",
            "trend_keywords": [],
            "trend_cache_hit": False,
        }

    # 3) 제목 3세트 생성
    title_sets = generate_title_sets(analysis, keyword_scores, language)

    # 4) 각 세트에 썸네일 추가
    result_sets: list[ResultSet] = []
    for ts in title_sets:
        thumb = generate_thumbnail(analysis, language)
        avg_score = (
            sum(ks.total_score for ks in keyword_scores[:5]) / min(5, len(keyword_scores))
            if keyword_scores
            else 0.5
        )
        # explanation 생성
        expl_data = explain_result_set(
            ts["yt_music_title"], ts["yt_playlist_title"], ts["set_label"]
        )
        explanation = ResultSetExplanation(
            yt_music_explanation=TitleExplanation(**expl_data["yt_music_explanation"]),
            yt_playlist_explanation=TitleExplanation(**expl_data["yt_playlist_explanation"]),
        )
        result_sets.append(
            ResultSet(
                set_label=ts["set_label"],
                yt_music_title=ts["yt_music_title"],
                yt_playlist_title=ts["yt_playlist_title"],
                thumbnail=thumb,
                seo_score=round(avg_score * 100, 1),
                explanation=explanation,
            )
        )

    gen_id = str(uuid.uuid4())[:8]

    return GenerationResponse(
        analysis=analysis,
        keyword_scores=keyword_scores[:15],
        results=result_sets,
        generation_id=gen_id,
        trend_enhanced=trend_meta.get("trend_enhanced", False),
        trends_source=trend_meta.get("trends_source"),
        trend_keywords=trend_meta.get("trend_keywords", []),
        trend_cache_hit=trend_meta.get("trend_cache_hit", False),
    )


async def _save_history(
    gen_id: str,
    input_type: str,
    input_data: dict,
    response: GenerationResponse,
):
    """생성 결과를 DB에 저장한다."""
    try:
        async with async_session() as session:
            record = GenerationHistory(
                id=gen_id,
                input_type=input_type,
                input_data=json.dumps(input_data, ensure_ascii=False),
                result_data=response.model_dump_json(),
                seo_score=response.results[0].seo_score if response.results else 0,
                created_at=datetime.utcnow(),
            )
            session.add(record)
            await session.commit()
    except Exception:
        pass  # 히스토리 저장 실패는 무시


# ── 엔드포인트 ──


@router.post("/generate/link", response_model=GenerationResponse)
async def generate_from_link(req: LinkInput):
    """재생목록 링크 기반 자동 생성"""
    # 1) 플레이리스트 파싱
    try:
        playlist = await parse_playlist(req.url)
    except PlaylistParseError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not playlist.tracks:
        raise HTTPException(status_code=400, detail="재생목록에 곡이 없습니다.")

    # 2) 메타데이터 분석
    analysis = analyze_playlist(playlist)

    # 3) 수동 보정 적용
    if req.override_genre:
        analysis.primary_genre = req.override_genre.value
        if req.override_genre.value not in analysis.detected_genres:
            analysis.detected_genres.insert(0, req.override_genre.value)
    if req.override_mood:
        analysis.primary_mood = req.override_mood.value
        if req.override_mood.value not in analysis.detected_moods:
            analysis.detected_moods.insert(0, req.override_mood.value)
    if req.override_situation:
        analysis.primary_situation = req.override_situation.value
        if req.override_situation.value not in analysis.detected_situations:
            analysis.detected_situations.insert(0, req.override_situation.value)

    # 금지 키워드 제거
    if req.exclude_keywords:
        excl = {kw.lower() for kw in req.exclude_keywords}
        analysis.keyword_pool = [
            k for k in analysis.keyword_pool if k.lower() not in excl
        ]

    # 4) 결과 생성
    language = req.language.value
    response = _build_response(analysis, language)

    await _save_history(
        response.generation_id, "link", req.model_dump(), response
    )
    return response


@router.post("/generate/manual", response_model=GenerationResponse)
async def generate_from_manual(req: ManualInput):
    """수동 입력 기반 생성"""
    # 수동 입력 → AnalysisResult 직접 구성
    keyword_pool: list[str] = [
        req.genre.value, req.mood.value, req.situation.value,
    ]
    if req.emotion:
        keyword_pool.append(req.emotion)
    keyword_pool.extend(req.reference_artists)

    analysis = AnalysisResult(
        detected_genres=[req.genre.value],
        detected_moods=[req.mood.value],
        detected_situations=[req.situation.value],
        primary_genre=req.genre.value,
        primary_mood=req.mood.value,
        primary_situation=req.situation.value,
        language=req.language.value,
        top_artists=req.reference_artists[:5],
        keyword_pool=keyword_pool,
    )

    # 금지 키워드 제거
    if req.exclude_keywords:
        excl = {kw.lower() for kw in req.exclude_keywords}
        analysis.keyword_pool = [
            k for k in analysis.keyword_pool if k.lower() not in excl
        ]

    language = req.language.value
    response = _build_response(analysis, language)

    await _save_history(
        response.generation_id, "manual", req.model_dump(), response
    )
    return response


@router.post("/generate/regenerate/{generation_id}", response_model=GenerationResponse)
async def regenerate(generation_id: str):
    """기존 결과를 기반으로 재생성 (새로운 조합 반환)"""
    try:
        async with async_session() as session:
            from sqlalchemy import select

            stmt = select(GenerationHistory).where(
                GenerationHistory.id == generation_id
            )
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()
    except Exception:
        record = None

    if not record:
        raise HTTPException(status_code=404, detail="해당 생성 결과를 찾을 수 없습니다.")

    input_data = json.loads(record.input_data)

    if record.input_type == "link":
        req = LinkInput(**input_data)
        # 재생성 시 re-parse 없이 저장된 분석 결과 재활용
        prev = GenerationResponse.model_validate_json(record.result_data)
        response = _build_response(prev.analysis, req.language.value)
    else:
        req = ManualInput(**input_data)
        analysis = AnalysisResult(
            detected_genres=[req.genre.value],
            detected_moods=[req.mood.value],
            detected_situations=[req.situation.value],
            primary_genre=req.genre.value,
            primary_mood=req.mood.value,
            primary_situation=req.situation.value,
            language=req.language.value,
            top_artists=req.reference_artists[:5],
            keyword_pool=[req.emotion] if req.emotion else [],
        )
        response = _build_response(analysis, req.language.value)

    await _save_history(
        response.generation_id, record.input_type, input_data, response
    )
    return response


@router.get("/history")
async def get_history(limit: int = 20):
    """생성 히스토리 조회"""
    try:
        async with async_session() as session:
            from sqlalchemy import select

            stmt = (
                select(GenerationHistory)
                .order_by(GenerationHistory.created_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            records = result.scalars().all()

        return [
            {
                "id": r.id,
                "input_type": r.input_type,
                "seo_score": r.seo_score,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ]
    except Exception:
        return []


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "SEO Creator API"}
