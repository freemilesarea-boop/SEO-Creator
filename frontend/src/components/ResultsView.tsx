"use client";

import { useState } from "react";
import {
  RefreshCw,
  Loader2,
  BarChart3,
  Tag,
  Music2,
  Smile,
  MapPin,
  Globe,
  Users,
  ChevronDown,
  ChevronUp,
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

export default function ResultsView({
  data,
  onRegenerate,
  onToast,
  onError,
}: ResultsViewProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await regenerate(data.generation_id);
      onRegenerate(result);
      onToast("새로운 결과가 생성되었습니다!");
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "재생성 중 오류가 발생했습니다."
      );
    } finally {
      setRegenerating(false);
    }
  };

  const maxScore = Math.max(
    ...data.keyword_scores.map((k) => k.total_score),
    1
  );

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
              <p className="text-xs font-medium text-zinc-500">장르 (Genre)</p>
              <p className="text-sm text-zinc-200">
                {data.analysis.primary_genre}
              </p>
              {data.analysis.detected_genres.length > 1 && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  감지: {data.analysis.detected_genres.join(", ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Smile className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">분위기 (Mood)</p>
              <p className="text-sm text-zinc-200">
                {data.analysis.primary_mood}
              </p>
              {data.analysis.detected_moods.length > 1 && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  감지: {data.analysis.detected_moods.join(", ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">상황 (Situation)</p>
              <p className="text-sm text-zinc-200">
                {data.analysis.primary_situation}
              </p>
              {data.analysis.detected_situations.length > 1 && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  감지: {data.analysis.detected_situations.join(", ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div>
              <p className="text-xs font-medium text-zinc-500">언어 (Language)</p>
              <p className="text-sm text-zinc-200">
                {data.analysis.language}
              </p>
            </div>
          </div>
          {data.analysis.top_artists.length > 0 && (
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
              <div>
                <p className="text-xs font-medium text-zinc-500">
                  주요 아티스트
                </p>
                <p className="text-sm text-zinc-200">
                  {data.analysis.top_artists.join(", ")}
                </p>
              </div>
            </div>
          )}
          {data.analysis.keyword_pool.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
              <div>
                <p className="text-xs font-medium text-zinc-500">키워드 풀</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {data.analysis.keyword_pool.slice(0, 8).map((kw, i) => (
                    <span
                      key={i}
                      className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                    >
                      {kw}
                    </span>
                  ))}
                  {data.analysis.keyword_pool.length > 8 && (
                    <span className="px-1 text-xs text-zinc-600">
                      +{data.analysis.keyword_pool.length - 8}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Keyword Scores Chart */}
      {data.keyword_scores.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowKeywords(!showKeywords)}
            className="flex w-full items-center justify-between"
          >
            <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
              <BarChart3 className="h-5 w-5 text-brand-400" />
              키워드 점수 (Keyword Scores)
            </h3>
            {showKeywords ? (
              <ChevronUp className="h-5 w-5 text-zinc-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-zinc-500" />
            )}
          </button>

          {showKeywords && (
            <div className="mt-4 space-y-2.5 animate-fade-in">
              {/* Legend */}
              <div className="mb-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" />
                  관련성
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" />
                  검색 의도
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  분위기
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                  장르
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
                  스팸 위험
                </span>
              </div>

              {data.keyword_scores.map((ks, i) => (
                <div key={i} className="group">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">
                      {ks.keyword}
                    </span>
                    <span className="text-xs font-semibold text-zinc-400">
                      {ks.total_score.toFixed(1)}
                    </span>
                  </div>

                  {/* Stacked bar */}
                  <div className="flex h-5 w-full overflow-hidden rounded-md bg-zinc-800">
                    <div
                      className="h-full bg-brand-500 transition-all duration-500"
                      style={{
                        width: `${(ks.relevance / maxScore) * 100}%`,
                      }}
                      title={`관련성: ${ks.relevance.toFixed(1)}`}
                    />
                    <div
                      className="h-full bg-sky-500 transition-all duration-500"
                      style={{
                        width: `${(ks.search_intent / maxScore) * 100}%`,
                      }}
                      title={`검색 의도: ${ks.search_intent.toFixed(1)}`}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all duration-500"
                      style={{
                        width: `${(ks.mood_match / maxScore) * 100}%`,
                      }}
                      title={`분위기: ${ks.mood_match.toFixed(1)}`}
                    />
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{
                        width: `${(ks.genre_match / maxScore) * 100}%`,
                      }}
                      title={`장르: ${ks.genre_match.toFixed(1)}`}
                    />
                    <div
                      className="h-full bg-red-500/70 transition-all duration-500"
                      style={{
                        width: `${(ks.spam_risk / maxScore) * 100}%`,
                      }}
                      title={`스팸 위험: ${ks.spam_risk.toFixed(1)}`}
                    />
                  </div>

                  {/* Detail on hover */}
                  <div className="mt-1 hidden group-hover:flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500 animate-fade-in">
                    <span>관련성 {ks.relevance.toFixed(1)}</span>
                    <span>검색 {ks.search_intent.toFixed(1)}</span>
                    <span>분위기 {ks.mood_match.toFixed(1)}</span>
                    <span>장르 {ks.genre_match.toFixed(1)}</span>
                    <span>스팸 {ks.spam_risk.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result Cards Grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-100">
            생성 결과 ({data.results.length}개)
          </h3>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="btn-secondary"
          >
            {regenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                재생성 중...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                재생성
              </>
            )}
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
