"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, Loader2, BarChart3, Tag, Music2, Smile, MapPin,
  Globe, Users, ChevronDown, ChevronUp, Star, Download,
} from "lucide-react";
import type {
  GenerationResponse,
  ExportFormat,
  KeywordScore,
} from "@/lib/api";
import {
  regenerateAll,
  hasFavorite,
  addFavorite,
  removeFavorite,
  saveExport,
} from "@/lib/api";
import ResultCard from "./ResultCard";

interface ResultsViewProps {
  data: GenerationResponse;
  onRegenerate: (data: GenerationResponse) => void;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
  /** 즐겨찾기 추가/제거 후 부모에서 FavoritesPanel을 재로딩하기 위한 콜백. */
  onFavoriteChange?: () => void;
}

export default function ResultsView({
  data,
  onRegenerate,
  onToast,
  onError,
  onFavoriteChange,
}: ResultsViewProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [favored, setFavored] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!data.generationId) {
      setFavored(false);
      return;
    }
    hasFavorite(data.generationId)
      .then((v) => { if (!cancelled) setFavored(Boolean(v)); })
      .catch(() => { if (!cancelled) setFavored(false); });
    return () => { cancelled = true; };
  }, [data.generationId]);

  const handleExport = async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(format);
    try {
      const r = await saveExport(data, format);
      if (r.cancelled) {
        onToast("저장이 취소되었습니다");
      } else {
        onToast(`${format.toUpperCase()}로 저장되었습니다`);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "저장에 실패했습니다");
    } finally {
      setExporting(null);
    }
  };

  const toggleFavorite = async () => {
    if (!data.generationId || favBusy) return;
    setFavBusy(true);
    try {
      if (favored) {
        await removeFavorite(data.generationId);
        setFavored(false);
        onToast("즐겨찾기에서 제거되었습니다");
      } else {
        const firstSet = data.results && data.results[0];
        const labelBits: string[] = [];
        if (firstSet?.setLabel) labelBits.push(firstSet.setLabel);
        if (firstSet?.ytMusicTitle) labelBits.push(firstSet.ytMusicTitle);
        const label = labelBits.join(" · ").slice(0, 60) || data.generationId;
        await addFavorite({
          id: data.generationId,
          label,
          payload: data,
        });
        setFavored(true);
        onToast("즐겨찾기에 추가되었습니다");
      }
      if (onFavoriteChange) onFavoriteChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : "즐겨찾기 작업에 실패했습니다");
    } finally {
      setFavBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await regenerateAll(data);
      onRegenerate(result);
      onToast("새로운 결과가 생성되었습니다!");
    } catch (err) {
      onError(err instanceof Error ? err.message : "재생성 중 오류가 발생했습니다.");
    } finally {
      setRegenerating(false);
    }
  };

  const a = data.analysis;
  const keywordScores: KeywordScore[] = data.keywordScores ?? [];
  const maxScore = Math.max(
    ...keywordScores.map((k) => k.totalScore ?? 0),
    0.01
  );

  return (
    <div className="space-y-6 animate-results-enter">
      {/* Sticky action bar */}
      <div className="sticky top-[72px] z-30 -mx-4 mb-2 px-4 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/80 px-3 py-2 shadow-lg backdrop-blur-lg">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <BarChart3 className="h-4 w-4 text-brand-400" />
            <span className="font-medium text-zinc-200">결과</span>
            <span className="hidden text-zinc-600 sm:inline">·</span>
            <span className="hidden truncate text-zinc-500 sm:inline">
              {a.primaryGenre} / {a.primaryMood} / {a.primarySituation}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleFavorite}
              disabled={favBusy || !data.generationId}
              className={`pill-action ${
                favored
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : "border-zinc-700/60 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-700/60"
              }`}
              title={favored ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            >
              {favBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Star
                  className={`h-3.5 w-3.5 ${favored ? "fill-amber-300 text-amber-300" : ""}`}
                />
              )}
              {favored ? "즐겨찾기됨" : "즐겨찾기"}
            </button>

            <div className="inline-flex items-stretch overflow-hidden rounded-md border border-zinc-700/60 bg-zinc-800/40 text-xs text-zinc-300">
              <span className="inline-flex items-center gap-1 px-2 py-1 text-zinc-500">
                <Download className="h-3.5 w-3.5" />
                내보내기
              </span>
              {(["json", "csv", "txt"] as ExportFormat[]).map((fmt) => {
                const isBusy = exporting === fmt;
                const disabled = exporting !== null;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleExport(fmt)}
                    disabled={disabled}
                    className="inline-flex items-center gap-1 border-l border-zinc-700/60 px-2 py-1 transition-colors hover:bg-zinc-700/60 disabled:opacity-50"
                    title={`${fmt.toUpperCase()}로 저장`}
                  >
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="pill-action border-brand-500/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20"
              title="모든 세트를 새로 생성"
            >
              {regenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  재생성 중...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  전체 재생성
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Analysis Summary */}
      <div className="card">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <BarChart3 className="h-5 w-5 text-brand-400" />
          분석 결과 요약
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-start gap-3">
            <Music2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">장르</p>
              <p className="text-sm text-zinc-200">{a.primaryGenre}</p>
              {a.detectedGenres.length > 1 && (
                <p className="mt-0.5 text-xs text-zinc-500">감지: {a.detectedGenres.join(", ")}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Smile className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">분위기</p>
              <p className="text-sm text-zinc-200">{a.primaryMood}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">상황</p>
              <p className="text-sm text-zinc-200">{a.primarySituation}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">언어</p>
              <p className="text-sm text-zinc-200">{a.language}</p>
            </div>
          </div>
          {a.topArtists.length > 0 && (
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
              <div>
                <p className="text-xs font-medium text-zinc-500">주요 아티스트</p>
                <p className="text-sm text-zinc-200">{a.topArtists.join(", ")}</p>
              </div>
            </div>
          )}
          {a.keywordPool.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
              <div>
                <p className="text-xs font-medium text-zinc-500">키워드 풀</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.keywordPool.slice(0, 8).map((kw: string, i: number) => (
                    <span key={i} className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{kw}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Keyword Scores */}
      {keywordScores.length > 0 && (
        <div className="card">
          <button onClick={() => setShowKeywords(!showKeywords)} className="flex w-full items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
              <BarChart3 className="h-5 w-5 text-brand-400" />
              키워드 점수
            </h3>
            {showKeywords ? <ChevronUp className="h-5 w-5 text-zinc-500" /> : <ChevronDown className="h-5 w-5 text-zinc-500" />}
          </button>
          {showKeywords && (
            <div className="mt-4 space-y-2.5 animate-fade-in">
              <div className="mb-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" />관련성</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" />검색 의도</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />분위기</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />장르</span>
              </div>
              {keywordScores.map((ks, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">{ks.keyword}</span>
                    <span className="text-xs font-semibold text-zinc-400">{(ks.totalScore ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex h-4 w-full overflow-hidden rounded-md bg-zinc-800">
                    <div className="h-full bg-brand-500" style={{ width: `${((ks.relevance ?? 0) / maxScore) * 100}%` }} />
                    <div className="h-full bg-sky-500" style={{ width: `${((ks.searchIntent ?? 0) / maxScore) * 100}%` }} />
                    <div className="h-full bg-amber-500" style={{ width: `${((ks.moodMatch ?? 0) / maxScore) * 100}%` }} />
                    <div className="h-full bg-emerald-500" style={{ width: `${((ks.genreMatch ?? 0) / maxScore) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result Cards */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-100">
            생성 결과 ({data.results.length}개)
          </h3>
          <span className="text-[11px] text-zinc-500">
            카드별 재생성은 카드 하단에서 · 전체 재생성은 상단 액션바에서
          </span>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.results.map((result, i) => (
            <ResultCard
              key={i}
              result={result}
              index={i}
              onToast={onToast}
              prevResponse={data}
              onUpdate={onRegenerate}
              onError={onError}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
