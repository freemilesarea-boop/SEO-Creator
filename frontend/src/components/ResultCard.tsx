"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Music,
  ListMusic,
  Image,
  Palette,
  Layout,
  Type,
  User,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Target,
  Zap,
  Shield,
  Hash,
} from "lucide-react";
import type { ResultSet, TitleExplanation } from "@/lib/api";

interface ResultCardProps {
  result: ResultSet;
  index: number;
  onToast: (msg: string) => void;
}

function FragmentBadge({ type, text, reason }: { type: string; text: string; reason: string }) {
  const colorMap: Record<string, string> = {
    situation: "bg-sky-500/15 text-sky-400 border-sky-500/20",
    genre: "bg-brand-500/15 text-brand-400 border-brand-500/20",
    ctr: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    seo: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };
  const iconMap: Record<string, React.ReactNode> = {
    situation: <Target className="h-2.5 w-2.5" />,
    genre: <Hash className="h-2.5 w-2.5" />,
    ctr: <Zap className="h-2.5 w-2.5" />,
    seo: <Shield className="h-2.5 w-2.5" />,
  };

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium ${colorMap[type] || "bg-zinc-700/30 text-zinc-400 border-zinc-600/20"}`}
      title={reason}
    >
      {iconMap[type]}
      <span>&quot;{text}&quot;</span>
      <span className="text-zinc-500">{reason}</span>
    </div>
  );
}

function ExplanationPanel({ explanation, label }: { explanation: TitleExplanation; label: string }) {
  if (!explanation || !explanation.title) return null;

  const compColor =
    explanation.competition === "low"
      ? "text-emerald-400"
      : explanation.competition === "medium"
        ? "text-amber-400"
        : "text-red-400";

  const intentLabel: Record<string, string> = {
    discovery: "탐색형",
    utility: "실용형",
    mood: "감성형",
    creator: "크리에이터형",
  };

  const typeLabel: Record<string, string> = {
    head: "Head",
    "mid-tail": "Mid-tail",
    "long-tail": "Long-tail",
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
        {label}
      </div>

      {/* 메타 정보 */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
          {typeLabel[explanation.keyword_type] || explanation.keyword_type}
        </span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
          {intentLabel[explanation.intent] || explanation.intent}
        </span>
        <span className={`rounded bg-zinc-800 px-1.5 py-0.5 ${compColor}`}>
          경쟁도: {explanation.competition}
        </span>
      </div>

      {/* 프래그먼트 분석 */}
      {explanation.fragments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {explanation.fragments.map((frag, i) => (
            <FragmentBadge key={i} type={frag.type} text={frag.text} reason={frag.reason} />
          ))}
        </div>
      )}

      {/* 요약 */}
      {explanation.summary && (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          {explanation.summary}
        </p>
      )}
    </div>
  );
}

export default function ResultCard({ result, index, onToast }: ResultCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      onToast("클립보드에 복사되었습니다!");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      onToast("복사에 실패했습니다.");
    }
  };

  // Support both camelCase (IPC) and snake_case (API) field names
  const r: any = result;
  const seoScore = r.seoScore ?? r.seo_score ?? 0;
  const setLabel = r.setLabel ?? r.set_label ?? "";
  const ytMusicTitle = r.ytMusicTitle ?? r.yt_music_title ?? "";
  const ytPlaylistTitle = r.ytPlaylistTitle ?? r.yt_playlist_title ?? "";
  const thumb = r.thumbnail || {};
  const mainKeywords = thumb.mainKeywords ?? thumb.main_keywords ?? [];
  const subKeywords = thumb.subKeywords ?? thumb.sub_keywords ?? [];
  const colorTone = thumb.colorTone ?? thumb.color_tone ?? [];
  const bgConcept = thumb.backgroundConcept ?? thumb.background_concept ?? "";
  const hasPerson = thumb.hasPerson ?? thumb.has_person ?? false;
  const thumbLayout = thumb.layout ?? "";
  const textOverlay = thumb.textOverlay ?? thumb.text_overlay ?? "";
  const explanation = r.explanation || null;

  const scoreColor =
    seoScore >= 80
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : seoScore >= 60
        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
        : "text-red-400 border-red-500/30 bg-red-500/10";

  const scoreTrackColor =
    seoScore >= 80
      ? "stroke-emerald-500"
      : seoScore >= 60
        ? "stroke-amber-500"
        : "stroke-red-500";

  const hasExplanation =
    explanation &&
    (explanation.yt_music_explanation?.title ||
      explanation.yt_playlist_explanation?.title);

  return (
    <div
      className="card animate-fade-in flex flex-col"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-brand-600/20 px-3 py-1 text-sm font-medium text-brand-300">
          {setLabel}
        </span>
        <div className="relative flex items-center justify-center">
          <svg width="64" height="64" className="-rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="4" className="text-zinc-800" />
            <circle
              cx="32" cy="32" r="26" fill="none" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 - (seoScore / 100) * 2 * Math.PI * 26}
              className={scoreTrackColor}
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <span className={`absolute text-xs font-bold ${scoreColor.split(" ")[0]}`}>
            {seoScore.toFixed(0)}
          </span>
        </div>
      </div>

      {/* YT Music Title */}
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <Music className="h-3 w-3" />
          YT Music 제목
        </div>
        <div className="group flex items-start justify-between gap-2 rounded-lg bg-zinc-800/70 p-3">
          <p className="text-sm leading-relaxed text-zinc-200">{ytMusicTitle}</p>
          <button
            onClick={() => copyToClipboard(ytMusicTitle, `music-${index}`)}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
            title="복사"
          >
            {copiedField === `music-${index}` ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* YT Playlist Title */}
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <ListMusic className="h-3 w-3" />
          YT Playlist 제목
        </div>
        <div className="group flex items-start justify-between gap-2 rounded-lg bg-zinc-800/70 p-3">
          <p className="text-sm leading-relaxed text-zinc-200">{ytPlaylistTitle}</p>
          <button
            onClick={() => copyToClipboard(ytPlaylistTitle, `playlist-${index}`)}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
            title="복사"
          >
            {copiedField === `playlist-${index}` ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Explanation Toggle */}
      {hasExplanation && (
        <div className="mb-4">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex w-full items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            <Lightbulb className="h-3 w-3" />
            {showExplanation ? "이유 접기" : "이유 보기"}
            {showExplanation ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showExplanation && explanation && (
            <div className="mt-3 space-y-4 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-4 animate-fade-in">
              <ExplanationPanel
                explanation={explanation.yt_music_explanation}
                label="YT Music 제목"
              />
              <div className="border-t border-zinc-800/50" />
              <ExplanationPanel
                explanation={explanation.yt_playlist_explanation}
                label="YT Playlist 제목"
              />
            </div>
          )}
        </div>
      )}

      {/* Thumbnail Suggestion */}
      <div className="mt-auto rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <Image className="h-3 w-3" />
          썸네일 컨셉 제안
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {mainKeywords.map((kw: string, i: number) => (
              <span key={`main-${i}`} className="rounded bg-brand-600/20 px-2 py-0.5 text-xs font-medium text-brand-300">{kw}</span>
            ))}
            {subKeywords.map((kw: string, i: number) => (
              <span key={`sub-${i}`} className="rounded bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">{kw}</span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Palette className="h-3 w-3 shrink-0 text-zinc-500" />
            <div className="flex items-center gap-1.5">
              {colorTone.map((color: string, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="h-4 w-4 rounded-full border border-zinc-600" style={{ backgroundColor: color }} title={color} />
                  <span className="text-xs text-zinc-500">{color}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Layout className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />
            <span className="text-zinc-400">{bgConcept}</span>
          </div>
          <div className="flex items-start gap-2">
            <Type className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />
            <span className="text-zinc-400">{thumbLayout}</span>
          </div>
          {textOverlay && (
            <div className="rounded bg-zinc-800/60 px-3 py-2 text-xs text-zinc-300 italic">
              &quot;{textOverlay}&quot;
            </div>
          )}
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 shrink-0 text-zinc-500" />
            <span className="text-xs text-zinc-500">인물 포함: {hasPerson ? "예" : "아니오"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
