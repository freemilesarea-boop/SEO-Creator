"use client";

import { useState } from "react";
import {
  RefreshCw, Loader2, BarChart3, Tag, Music2, Smile, MapPin,
  Globe, Users, ChevronDown, ChevronUp,
} from "lucide-react";
import type { GenerationResponse } from "@/lib/api";
import { regenerate } from "@/lib/api";
import ResultCard from "./ResultCard";

interface ResultsViewProps {
  data: GenerationResponse;
  onRegenerate: (data: GenerationResponse) => void;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function ResultsView({ data, onRegenerate, onToast, onError }: ResultsViewProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await regenerate(data.generationId);
      onRegenerate(result);
      onToast("새로운 결과가 생성되었습니다!");
    } catch (err) {
      onError(err instanceof Error ? err.message : "재생성 중 오류가 발생했습니다.");
    } finally {
      setRegenerating(false);
    }
  };

  const a = data.analysis;
  const keywordScores = data.keywordScores ?? [];
  const maxScore = Math.max(...keywordScores.map((k) => k.totalScore ?? 0), 0.01);

  return (
    <div className="space-y-8 animate-fade-in">
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
                  {a.keywordPool.slice(0, 8).map((kw, i) => (
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
          <h3 className="text-lg font-semibold text-zinc-100">생성 결과 ({data.results.length}개)</h3>
          <button onClick={handleRegenerate} disabled={regenerating} className="btn-secondary">
            {regenerating ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />재생성 중...</>) : (<><RefreshCw className="h-3.5 w-3.5" />재생성</>)}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.results.map((result, i) => (
            <ResultCard key={i} result={result} index={i} onToast={onToast} />
          ))}
        </div>
      </div>
    </div>
  );
}
