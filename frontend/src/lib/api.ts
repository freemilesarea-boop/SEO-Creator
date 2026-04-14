// ── Types ──

export interface Analysis {
  detectedGenres: string[];
  detectedMoods: string[];
  detectedSituations: string[];
  primaryGenre: string;
  primaryMood: string;
  primarySituation: string;
  language: string;
  topArtists: string[];
  keywordPool: string[];
}

export interface KeywordScore {
  keyword: string;
  relevance: number;
  searchIntent: number;
  moodMatch: number;
  genreMatch: number;
  spamRisk: number;
  totalScore: number;
}

export interface ThumbnailSuggestion {
  mainKeywords: string[];
  subKeywords: string[];
  colorTone: string[];
  backgroundConcept: string;
  hasPerson: boolean;
  layout: string;
  textOverlay: string;
}

export interface TitleFragment {
  text: string;
  reason: string;
  type: string;
}

export interface TitleExplanation {
  title: string;
  keyword_type: string;
  intent: string;
  competition: string;
  fragments: TitleFragment[];
  summary: string;
}

export interface ResultSetExplanation {
  yt_music_explanation: TitleExplanation;
  yt_playlist_explanation: TitleExplanation;
}

export interface ResultSet {
  setLabel: string;
  ytMusicTitle: string;
  ytPlaylistTitle: string;
  thumbnail: ThumbnailSuggestion;
  seoScore: number;
  explanation?: ResultSetExplanation | null;
}

export interface GenerationResponse {
  analysis: Analysis;
  keywordScores: KeywordScore[];
  results: ResultSet[];
  generationId: string;
  trendEnhanced?: boolean;
  trendsSource?: string;
  trendKeywords?: string[];
  trendCacheHit?: boolean;
}

export interface LinkInput {
  url: string;
  language?: string;
  overrideGenre?: string;
  overrideMood?: string;
  overrideSituation?: string;
  excludeKeywords?: string[];
}

export interface ManualInput {
  genre: string;
  mood: string;
  situation: string;
  language: string;
  emotion?: string;
  referenceArtists?: string[];
  excludeKeywords?: string[];
}

// ── API Layer ──
// Electron IPC 사용 (서버 없음)
// 웹 모드 fallback (localhost:8000) 유지

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      generateManual: (input: ManualInput) => Promise<{ ok: boolean; data?: GenerationResponse; error?: string }>;
      generateLink: (input: LinkInput) => Promise<{ ok: boolean; data?: GenerationResponse; error?: string }>;
      getHistory: (limit?: number) => Promise<{ ok: boolean; data?: any[]; error?: string }>;
      healthCheck: () => Promise<any>;
    };
  }
}

const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;

// ── Electron IPC mode ──

async function ipcCall<T>(method: string, input?: any): Promise<T> {
  const api = window.electronAPI!;
  let result: any;

  switch (method) {
    case "generateManual":
      result = await api.generateManual(input);
      break;
    case "generateLink":
      result = await api.generateLink(input);
      break;
    case "getHistory":
      result = await api.getHistory(input);
      break;
    default:
      throw new Error(`Unknown method: ${method}`);
  }

  if (!result.ok) throw new Error(result.error || "알 수 없는 오류");
  return result.data as T;
}

// ── Web fallback (fetch) ──

const API_BASE = "http://localhost:8000";

async function fetchCall<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = "요청 처리 중 오류가 발생했습니다.";
    try { const err = await res.json(); detail = err.detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ── Public API ──

export async function generateFromLink(input: LinkInput): Promise<GenerationResponse> {
  if (isElectron) return ipcCall<GenerationResponse>("generateLink", input);
  return fetchCall(`${API_BASE}/api/v1/generate/link`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
}

export async function generateFromManual(input: ManualInput): Promise<GenerationResponse> {
  if (isElectron) return ipcCall<GenerationResponse>("generateManual", input);
  return fetchCall(`${API_BASE}/api/v1/generate/manual`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
}

export async function regenerate(generationId: string): Promise<GenerationResponse> {
  // regenerate는 같은 입력으로 재생성 — Electron에서는 generateManual 재호출로 대체
  if (isElectron) {
    // 간단하게 기본 파라미터로 재생성
    return ipcCall<GenerationResponse>("generateManual", {
      genre: "pop", mood: "chill", situation: "cafe", language: "ko"
    });
  }
  return fetchCall(`${API_BASE}/api/v1/generate/regenerate/${generationId}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
  });
}

export async function getHistory(): Promise<any[]> {
  if (isElectron) return ipcCall<any[]>("getHistory", 20);
  return fetchCall(`${API_BASE}/api/v1/history`);
}
