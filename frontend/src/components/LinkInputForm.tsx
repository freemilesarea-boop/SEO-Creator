"use client";

import { useState } from "react";
import { Link2, Loader2, Sparkles } from "lucide-react";
import { generateFromLink, type LinkInput, type GenerationResponse } from "@/lib/api";

const GENRES = [
  { value: "", label: "자동 감지" },
  { value: "kpop", label: "K-Pop" },
  { value: "pop", label: "Pop" },
  { value: "rnb", label: "R&B" },
  { value: "hiphop", label: "Hip-Hop" },
  { value: "lofi", label: "Lo-Fi" },
  { value: "jazz", label: "Jazz" },
  { value: "rock", label: "Rock" },
  { value: "edm", label: "EDM" },
  { value: "classical", label: "Classical" },
  { value: "indie", label: "Indie" },
  { value: "ballad", label: "Ballad" },
  { value: "acoustic", label: "Acoustic" },
  { value: "latin", label: "Latin" },
  { value: "jpop", label: "J-Pop" },
  { value: "ost", label: "OST" },
];

const MOODS = [
  { value: "", label: "자동 감지" },
  { value: "chill", label: "Chill (차분한)" },
  { value: "emotional", label: "Emotional (감성적)" },
  { value: "energetic", label: "Energetic (에너지)" },
  { value: "dreamy", label: "Dreamy (몽환적)" },
  { value: "sexy", label: "Sexy (섹시한)" },
  { value: "happy", label: "Happy (행복한)" },
  { value: "sad", label: "Sad (슬픈)" },
  { value: "dark", label: "Dark (어두운)" },
  { value: "romantic", label: "Romantic (로맨틱)" },
  { value: "nostalgic", label: "Nostalgic (향수)" },
  { value: "peaceful", label: "Peaceful (평화로운)" },
  { value: "intense", label: "Intense (강렬한)" },
];

const SITUATIONS = [
  { value: "", label: "자동 감지" },
  { value: "study", label: "Study (공부)" },
  { value: "night_drive", label: "Night Drive (야간 드라이브)" },
  { value: "workout", label: "Workout (운동)" },
  { value: "cafe", label: "Cafe (카페)" },
  { value: "sleep", label: "Sleep (수면)" },
  { value: "morning", label: "Morning (아침)" },
  { value: "rain", label: "Rain (비 오는 날)" },
  { value: "commute", label: "Commute (출퇴근)" },
  { value: "party", label: "Party (파티)" },
  { value: "cooking", label: "Cooking (요리)" },
  { value: "reading", label: "Reading (독서)" },
  { value: "walk", label: "Walk (산책)" },
];

const LANGUAGES = [
  { value: "", label: "자동 감지" },
  { value: "ko", label: "한국어 (Korean)" },
  { value: "en", label: "영어 (English)" },
  { value: "mixed", label: "혼합 (Mixed)" },
];

interface LinkInputFormProps {
  onResult: (result: GenerationResponse) => void;
  onError: (msg: string) => void;
}

export default function LinkInputForm({ onResult, onError }: LinkInputFormProps) {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [overrideGenre, setOverrideGenre] = useState("");
  const [overrideMood, setOverrideMood] = useState("");
  const [overrideSituation, setOverrideSituation] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [showOverrides, setShowOverrides] = useState(false);
  const [loading, setLoading] = useState(false);

  const isValidUrl = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      onError("URL을 입력해주세요.");
      return;
    }
    if (!isValidUrl(url.trim())) {
      onError("올바른 URL 형식이 아닙니다.");
      return;
    }

    setLoading(true);
    try {
      const input: LinkInput = { url: url.trim() };
      if (language) input.language = language;
      if (overrideGenre) input.override_genre = overrideGenre;
      if (overrideMood) input.override_mood = overrideMood;
      if (overrideSituation) input.override_situation = overrideSituation;
      if (excludeKeywords.trim()) {
        input.exclude_keywords = excludeKeywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }
      const result = await generateFromLink(input);
      onResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          플레이리스트 URL
        </label>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/playlist?list=..."
            className="input-field pl-10"
            disabled={loading}
          />
        </div>
        {url && !isValidUrl(url) && (
          <p className="mt-1.5 text-xs text-red-400">올바른 URL 형식이 아닙니다.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowOverrides(!showOverrides)}
        className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
      >
        {showOverrides ? "고급 옵션 접기 \u25B2" : "고급 옵션 펼치기 \u25BC"}
      </button>

      {showOverrides && (
        <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 animate-fade-in">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                언어 (Language)
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="select-field text-sm"
                disabled={loading}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                장르 오버라이드 (Genre)
              </label>
              <select
                value={overrideGenre}
                onChange={(e) => setOverrideGenre(e.target.value)}
                className="select-field text-sm"
                disabled={loading}
              >
                {GENRES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                분위기 오버라이드 (Mood)
              </label>
              <select
                value={overrideMood}
                onChange={(e) => setOverrideMood(e.target.value)}
                className="select-field text-sm"
                disabled={loading}
              >
                {MOODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                상황 오버라이드 (Situation)
              </label>
              <select
                value={overrideSituation}
                onChange={(e) => setOverrideSituation(e.target.value)}
                className="select-field text-sm"
                disabled={loading}
              >
                {SITUATIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              제외 키워드 (쉼표로 구분)
            </label>
            <input
              type="text"
              value={excludeKeywords}
              onChange={(e) => setExcludeKeywords(e.target.value)}
              placeholder="예: playlist, music, 2024"
              className="input-field text-sm"
              disabled={loading}
            />
          </div>
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            분석 중...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            SEO 생성하기
          </>
        )}
      </button>
    </form>
  );
}
