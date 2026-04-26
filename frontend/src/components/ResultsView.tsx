"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw, Loader2, BarChart3, Tag, Music2, Smile, MapPin,
  Globe, Users, ChevronDown, ChevronUp, Star,
} from "lucide-react";
import type { GenerationResponse } from "@/lib/api";
import {
  regenerateAll,
  hasFavorite,
  addFavorite,
  removeFavorite,
} from "@/lib/api";
import ResultCard from "./ResultCard";

// dual-compat helper: camelCase or snake_case
function g(obj: any, camel: string, snake: string, fallback: any = "") {
  return obj?.[camel] ?? obj?.[snake] ?? fallback;
}

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

  const a: any = data.analysis || {};
  const keywordScores: any[] = g(data, "keywordScores", "keyword_scores", []);
  const maxScore = Math.max(...keywordScores.map((k: any) => g(k, "totalScore", "total_score", 0)), 0.01);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Analysis Summary */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <BarChart3 className="h-5 w-5 text-brand-400" />
            분석 결과 요약
          </h3>
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favBusy || !data.generationId}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
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
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-start gap-3">
            <Music2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">장르</p>
              <p className="text-sm text-zinc-200">{g(a, "primaryGenre", "primary_genre")}</p>
              {(g(a, "detectedGenres", "detected_genres", []) as string[]).length > 1 && (
                <p className="mt-0.5 text-xs text-zinc-500">감지: {(g(a, "detectedGenres", "detected_genres", []) as string[]).join(", ")}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Smile className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">분위기</p>
              <p className="text-sm text-zinc-200">{g(a, "primaryMood", "primary_mood")}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">상황</p>
              <p className="text-sm text-zinc-200">{g(a, "primarySituation", "primary_situation")}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">언어</p>
              <p className="text-sm text-zinc-200">{a.language}</p>
            </div>
          </div>
          {(g(a, "topArtists", "top_artists", []) as string[]).length > 0 && (
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
              <div>
                <p className="text-xs font-medium text-zinc-500">주요 아티스트</p>
                <p className="text-sm text-zinc-200">{(g(a, "topArtists", "top_artists", []) as string[]).join(", ")}</p>
              </div>
            </div>
          )}
          {(g(a, "keywordPool", "keyword_pool", []) as string[]).length > 0 && (
            <div className="flex items-start gap-3">
              <Tag className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
              <div>
                <p className="text-xs font-medium text-zinc-500">키워드 풀</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(g(a, "keywordPool", "keyword_pool", []) as string[]).slice(0, 8).map((kw: string, i: number) => (
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
              {keywordScores.map((ks: any, i: number) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">{ks.keyword}</span>
                    <span className="text-xs font-semibold text-zinc-400">{g(ks, "totalScore", "total_score", 0).toFixed(2)}</span>
                  </div>
                  <div className="flex h-4 w-full overflow-hidden rounded-md bg-zinc-800">
                    <div className="h-full bg-brand-500" style={{ width: `${(g(ks, "relevance", "relevance", 0) / maxScore) * 100}%` }} />
                    <div className="h-full bg-sky-500" style={{ width: `${(g(ks, "searchIntent", "search_intent", 0) / maxScore) * 100}%` }} />
                    <div className="h-full bg-amber-500" style={{ width: `${(g(ks, "moodMatch", "mood_match", 0) / maxScore) * 100}%` }} />
                    <div className="h-full bg-emerald-500" style={{ width: `${(g(ks, "genreMatch", "genre_match", 0) / maxScore) * 100}%` }} />
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
          <h3 className="text-lg font-semibold text-zinc-100">생성 결과 ({data.results.length}개)</h3>
          <button onClick={handleRegenerate} disabled={regenerating} className="btn-secondary">
            {regenerating ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />재생성 중...</>) : (<><RefreshCw className="h-3.5 w-3.5" />재생성</>)}
          </button>
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
