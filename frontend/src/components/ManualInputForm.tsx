"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateFromManual, type ManualInput, type GenerationResponse } from "@/lib/api";

const GENRES = [
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
  { value: "ko", label: "한국어 (Korean)" },
  { value: "en", label: "영어 (English)" },
  { value: "mixed", label: "혼합 (Mixed)" },
];

interface ManualInputFormProps {
  onResult: (result: GenerationResponse) => void;
  onError: (msg: string) => void;
}

export default function ManualInputForm({ onResult, onError }: ManualInputFormProps) {
  const [genre, setGenre] = useState("kpop");
  const [mood, setMood] = useState("chill");
  const [situation, setSituation] = useState("study");
  const [language, setLanguage] = useState("ko");
  const [emotion, setEmotion] = useState("");
  const [referenceArtists, setReferenceArtists] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const input: ManualInput = { genre, mood, situation, language };
      if (emotion.trim()) input.emotion = emotion.trim();
      if (referenceArtists.trim()) {
        input.referenceArtists = referenceArtists
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
      }
      if (excludeKeywords.trim()) {
        input.excludeKeywords = excludeKeywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }
      const result = await generateFromManual(input);
      onResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            장르 (Genre)
          </label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="select-field"
            disabled={loading}
          >
            {GENRES.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            분위기 (Mood)
          </label>
          <select
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="select-field"
            disabled={loading}
          >
            {MOODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            상황 (Situation)
          </label>
          <select
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            className="select-field"
            disabled={loading}
          >
            {SITUATIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">
            언어 (Language)
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="select-field"
            disabled={loading}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">
          감정 / 분위기 설명 (Emotion)
          <span className="ml-1 text-xs text-zinc-500">선택</span>
        </label>
        <input
          type="text"
          value={emotion}
          onChange={(e) => setEmotion(e.target.value)}
          placeholder="예: 새벽에 혼자 듣고 싶은 쓸쓸한 느낌"
          className="input-field"
          disabled={loading}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">
          참고 아티스트 (Reference Artists)
          <span className="ml-1 text-xs text-zinc-500">선택, 쉼표로 구분</span>
        </label>
        <input
          type="text"
          value={referenceArtists}
          onChange={(e) => setReferenceArtists(e.target.value)}
          placeholder="예: IU, 태양, Dean"
          className="input-field"
          disabled={loading}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">
          제외 키워드
          <span className="ml-1 text-xs text-zinc-500">선택, 쉼표로 구분</span>
        </label>
        <input
          type="text"
          value={excludeKeywords}
          onChange={(e) => setExcludeKeywords(e.target.value)}
          placeholder="예: playlist, music, 2024"
          className="input-field"
          disabled={loading}
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            생성 중...
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
