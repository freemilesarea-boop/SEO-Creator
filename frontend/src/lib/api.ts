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
  keywordType: string;
  intent: string;
  competition: string;
  fragments: TitleFragment[];
  summary: string;
}

export interface ResultSetExplanation {
  ytMusicExplanation: TitleExplanation;
  ytPlaylistExplanation: TitleExplanation;
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
//
// 기본 동작 모드:
//   - Electron 환경: window.electronAPI 를 통한 IPC 호출 (백엔드 서버 불필요)
//   - 웹 환경(브라우저 직접 접근): NEXT_PUBLIC_API_BASE 가 설정된 경우에만
//     해당 URL로 fetch fallback. 미설정 시 명시적 에러를 던짐.
//
// 현재 v4 아키텍처는 Electron-only 이므로 웹 모드는 옵션 기능이다.
// dev.sh가 띄우는 Python 백엔드(레거시)는 18484 포트를 사용하므로
// 브라우저 모드를 직접 띄울 때는 NEXT_PUBLIC_API_BASE=http://127.0.0.1:18484
// 와 같이 환경변수를 명시한다.

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      generateManual: (input: ManualInput) => Promise<{ ok: boolean; data?: GenerationResponse; error?: string }>;
      generateLink: (input: LinkInput) => Promise<{ ok: boolean; data?: GenerationResponse; error?: string }>;
      regenerate: (generationId: string) => Promise<{ ok: boolean; data?: GenerationResponse; error?: string }>;
      getHistory: (limit?: number) => Promise<{ ok: boolean; data?: any[]; error?: string }>;
      healthCheck: () => Promise<any>;
    };
  }
}

const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;

// ── Electron IPC mode ──

async function ipcCall<T>(method: string, input?: any): Promise<T> {
  const api = window.electronAPI!;
  let result: { ok: boolean; data?: unknown; error?: string };

  switch (method) {
    case "generateManual":
      result = await api.generateManual(input);
      break;
    case "generateLink":
      result = await api.generateLink(input);
      break;
    case "regenerate":
      result = await api.regenerate(input);
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

const API_BASE =
  (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_API_BASE) ||
  "";

function ensureWebMode(): string {
  if (!API_BASE) {
    throw new Error(
      "이 빌드는 Electron 전용입니다. 브라우저에서 사용하려면 NEXT_PUBLIC_API_BASE 환경변수에 백엔드 URL을 지정하세요 (예: http://127.0.0.1:18484)."
    );
  }
  return API_BASE;
}

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
  return fetchCall(`${ensureWebMode()}/api/v1/generate/link`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
}

export async function generateFromManual(input: ManualInput): Promise<GenerationResponse> {
  if (isElectron) return ipcCall<GenerationResponse>("generateManual", input);
  return fetchCall(`${ensureWebMode()}/api/v1/generate/manual`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
}

export async function regenerate(generationId: string): Promise<GenerationResponse> {
  if (isElectron) return ipcCall<GenerationResponse>("regenerate", generationId);
  return fetchCall(`${ensureWebMode()}/api/v1/generate/regenerate/${generationId}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
  });
}

export async function getHistory(): Promise<any[]> {
  if (isElectron) return ipcCall<any[]>("getHistory", 20);
  return fetchCall(`${ensureWebMode()}/api/v1/history`);
}
