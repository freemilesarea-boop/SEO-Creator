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
} from "lucide-react";
import type { ResultSet } from "@/lib/api";

interface ResultCardProps {
  result: ResultSet;
  index: number;
  onToast: (msg: string) => void;
}

export default function ResultCard({ result, index, onToast }: ResultCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const scoreColor =
    result.seo_score >= 80
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : result.seo_score >= 60
        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
        : "text-red-400 border-red-500/30 bg-red-500/10";

  const scoreTrackColor =
    result.seo_score >= 80
      ? "stroke-emerald-500"
      : result.seo_score >= 60
        ? "stroke-amber-500"
        : "stroke-red-500";

  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (result.seo_score / 100) * circumference;

  return (
    <div
      className="card animate-fade-in flex flex-col"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-brand-600/20 px-3 py-1 text-sm font-medium text-brand-300">
          {result.set_label}
        </span>
        {/* SEO Score Circle */}
        <div className="relative flex items-center justify-center">
          <svg width="64" height="64" className="-rotate-90">
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-zinc-800"
            />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={
                2 * Math.PI * 26 - (result.seo_score / 100) * 2 * Math.PI * 26
              }
              className={scoreTrackColor}
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <span className={`absolute text-xs font-bold ${scoreColor.split(" ")[0]}`}>
            {result.seo_score.toFixed(0)}
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
          <p className="text-sm leading-relaxed text-zinc-200">
            {result.yt_music_title}
          </p>
          <button
            onClick={() => copyToClipboard(result.yt_music_title, `music-${index}`)}
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
          <p className="text-sm leading-relaxed text-zinc-200">
            {result.yt_playlist_title}
          </p>
          <button
            onClick={() =>
              copyToClipboard(result.yt_playlist_title, `playlist-${index}`)
            }
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

      {/* Thumbnail Suggestion */}
      <div className="mt-auto rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <Image className="h-3 w-3" />
          썸네일 컨셉 제안
        </div>

        <div className="space-y-2.5 text-sm">
          {/* Main & Sub Keywords */}
          <div className="flex flex-wrap gap-1.5">
            {result.thumbnail.main_keywords.map((kw, i) => (
              <span
                key={`main-${i}`}
                className="rounded bg-brand-600/20 px-2 py-0.5 text-xs font-medium text-brand-300"
              >
                {kw}
              </span>
            ))}
            {result.thumbnail.sub_keywords.map((kw, i) => (
              <span
                key={`sub-${i}`}
                className="rounded bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400"
              >
                {kw}
              </span>
            ))}
          </div>

          {/* Color Tones */}
          <div className="flex items-center gap-2">
            <Palette className="h-3 w-3 shrink-0 text-zinc-500" />
            <div className="flex items-center gap-1.5">
              {result.thumbnail.color_tone.map((color, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div
                    className="h-4 w-4 rounded-full border border-zinc-600"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                  <span className="text-xs text-zinc-500">{color}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Background Concept */}
          <div className="flex items-start gap-2">
            <Layout className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />
            <span className="text-zinc-400">{result.thumbnail.background_concept}</span>
          </div>

          {/* Layout */}
          <div className="flex items-start gap-2">
            <Type className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />
            <span className="text-zinc-400">{result.thumbnail.layout}</span>
          </div>

          {/* Text Overlay */}
          {result.thumbnail.text_overlay && (
            <div className="rounded bg-zinc-800/60 px-3 py-2 text-xs text-zinc-300 italic">
              &quot;{result.thumbnail.text_overlay}&quot;
            </div>
          )}

          {/* Has Person */}
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 shrink-0 text-zinc-500" />
            <span className="text-xs text-zinc-500">
              인물 포함: {result.thumbnail.has_person ? "예" : "아니오"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
