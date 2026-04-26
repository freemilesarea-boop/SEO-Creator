/**
 * frontend/src/lib/api.ts
 *
 * Electron-only API surface (Step 6a).
 *
 * - localhost:8000 fetch fallback 제거
 * - camelCase 단일 컨벤션
 * - window.electronAPI 타입을 IPC 채널 19개와 동기화
 * - 신규 응답 필드 타입(breakdown, descriptionPack, fontFeel, avoidList,
 *   photoSearchKeywords, regeneratedAt/Type, seedSalt) 추가
 *
 * 새 API 함수(regenerateAll/Set/Title/Thumbnail/Tags, addFavorite, ...)
 * 노출은 Step 6b에서 진행한다.
 */

// ── Domain types ──

export interface ThumbnailSuggestion {
  mainKeywords: string[];
  subKeywords: string[];
  colorTone: string[];
  backgroundConcept: string;
  composition?: string;
  hasPerson: boolean;
  layout: string;
  textOverlay: string;
  fontFeel?: string;
  avoidList?: string[];
  photoSearchKeywords?: string[];
}

export interface TitleFragment {
  text: string;
  reason: string;
  type: string;
}

export interface TitleExplanation {
  title: string;
  /** 신규 (engine ≥ 2.1) */
  keywordType?: string;
  /** 호환 (engine ≤ 2.0 snake_case) */
  keyword_type?: string;
  intent: string;
  competition: string;
  fragments: TitleFragment[];
  summary: string;
}

export interface ResultSetExplanation {
  /** 호환: engine은 ytMusicExplanation/ytPlaylistExplanation을 카멜로 반환 */
  ytMusicExplanation?: TitleExplanation;
  ytPlaylistExplanation?: TitleExplanation;
  /** 호환: 기존 컴포넌트가 snake_case로 접근하던 경로 */
  yt_music_explanation?: TitleExplanation;
  yt_playlist_explanation?: TitleExplanation;
}

export interface DescriptionPack {
  description: string;
  tags: string[];
  hashtags: string[];
}

export interface ScoreBreakdown {
  intentFit: number;
  keywordCoverage: number;
  titleClickability: number;
  tagQuality: number;
  thumbnailRelevance: number;
  competitionBonus: number;
  diversityBonus: number;
}

export interface ResultSet {
  /** "emotional" | "search" | "longtail" */
  setKey?: string;
  setLabel: string;
  intent?: string;
  ytMusicTitle: string;
  ytPlaylistTitle: string;
  usedKeywords?: string[];
  thumbnail: ThumbnailSuggestion;
  descriptionPack?: DescriptionPack;
  seoScore: number;
  breakdown?: ScoreBreakdown;
  explanation?: ResultSetExplanation | null;
}

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

export interface GenerationResponse {
  generationId: string;
  createdAt?: string;
  language?: string;
  analysis: Analysis;
  keywordScores: KeywordScore[];
  results: ResultSet[];
  trendEnhanced?: boolean;
  trendsSource?: string;
  trendKeywords?: string[];
  trendCacheHit?: boolean;
  /** regenerate 결과에서만 셋팅 */
  regeneratedAt?: string;
  regeneratedType?: string;
  seedSalt?: string | number;
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

export interface RegenerateOpts {
  seedSalt?: string | number;
}

export interface FavoriteRecord {
  id: string;
  label?: string;
  payload?: unknown;
  favoritedAt?: string;
}

export interface HistoryListItem {
  id: string;
  inputType: string;
  seoScore: number;
  createdAt: string | null;
  label?: string | null;
}

// ── IPC envelope ──

export type IpcEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── window.electronAPI typing ──

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;

  healthCheck: () => Promise<{ status: string; service: string }>;
  getAppVersion: () => Promise<IpcEnvelope<string>>;

  // generate
  generateManual: (input: ManualInput) => Promise<IpcEnvelope<GenerationResponse>>;
  generateLink: (input: LinkInput) => Promise<IpcEnvelope<GenerationResponse>>;

  // regenerate
  regenerateAll: (
    prev: GenerationResponse,
    opts?: RegenerateOpts
  ) => Promise<IpcEnvelope<GenerationResponse>>;
  regenerateSet: (
    prev: GenerationResponse,
    setKey: string,
    opts?: RegenerateOpts
  ) => Promise<IpcEnvelope<GenerationResponse>>;
  regenerateTitle: (
    prev: GenerationResponse,
    setKey: string,
    opts?: RegenerateOpts
  ) => Promise<IpcEnvelope<GenerationResponse>>;
  regenerateThumbnail: (
    prev: GenerationResponse,
    setKey: string,
    opts?: RegenerateOpts
  ) => Promise<IpcEnvelope<GenerationResponse>>;
  regenerateTags: (
    prev: GenerationResponse,
    setKey: string,
    opts?: RegenerateOpts
  ) => Promise<IpcEnvelope<GenerationResponse>>;

  // favorites
  addFavorite: (record: FavoriteRecord) => Promise<IpcEnvelope<{ total: number }>>;
  removeFavorite: (id: string) => Promise<IpcEnvelope<boolean>>;
  listFavorites: () => Promise<IpcEnvelope<FavoriteRecord[]>>;
  hasFavorite: (id: string) => Promise<IpcEnvelope<boolean>>;

  // history
  getHistory: (limit?: number) => Promise<IpcEnvelope<HistoryListItem[]>>;
  getHistoryDetail: (id: string) => Promise<IpcEnvelope<GenerationResponse | null>>;
  removeHistory: (id: string) => Promise<IpcEnvelope<boolean>>;

  // export
  exportJSON: (response: GenerationResponse) => Promise<IpcEnvelope<string>>;
  exportCSV: (response: GenerationResponse) => Promise<IpcEnvelope<string>>;
  exportTXT: (response: GenerationResponse) => Promise<IpcEnvelope<string>>;
  suggestExportFilename: (
    response: GenerationResponse,
    ext: string
  ) => Promise<IpcEnvelope<string>>;
  saveExport: (
    response: GenerationResponse,
    format: ExportFormat
  ) => Promise<IpcEnvelope<{ cancelled: boolean; filePath?: string }>>;
}

export type ExportFormat = "json" | "csv" | "txt";

export interface SaveExportResult {
  cancelled: boolean;
  filePath?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// ── Internals ──

const isElectron =
  typeof window !== "undefined" && !!window.electronAPI?.isElectron;

function _api(): ElectronAPI {
  if (!isElectron || !window.electronAPI) {
    throw new Error(
      "Electron 환경이 필요합니다. SEO Creator 데스크톱 앱에서 실행해주세요."
    );
  }
  return window.electronAPI;
}

/** envelope 풀어내고 ok:false면 throw. */
async function unwrap<T>(p: Promise<IpcEnvelope<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) {
    throw new Error(r.error || "요청 처리 중 오류가 발생했습니다.");
  }
  return r.data;
}

// ── Public API (Step 6a 범위 — 기존 4개 유지) ──

export async function generateFromLink(
  input: LinkInput
): Promise<GenerationResponse> {
  return unwrap(_api().generateLink(input));
}

export async function generateFromManual(
  input: ManualInput
): Promise<GenerationResponse> {
  return unwrap(_api().generateManual(input));
}

/**
 * @deprecated since 2.1.0 — Step 6b에서 regenerateAll/regenerateSet으로
 * 대체될 예정. 호출 시그니처 호환을 위해 유지.
 *
 * 현재 구현은 직전 generation의 input 정보를 잃어버린 placeholder다.
 * 새 코드는 `regenerateAll(prev, opts)` 또는 `regenerateSet(prev, setKey, opts)`를 사용할 것.
 */
export async function regenerate(
  _generationId: string
): Promise<GenerationResponse> {
  return unwrap(
    _api().generateManual({
      genre: "pop",
      mood: "chill",
      situation: "cafe",
      language: "ko",
    })
  );
}

export async function getHistory(): Promise<HistoryListItem[]> {
  return unwrap(_api().getHistory(20));
}

/**
 * 앱 버전을 안전하게 반환한다.
 * - Electron 환경: app.getVersion() (= package.json `version`)
 * - 그 외 (Next dev server 직접 접속 등): "dev"
 * - IPC 실패 시에도 throw 하지 않고 "dev" 반환.
 */
export async function getAppVersion(): Promise<string> {
  if (!isElectron || !window.electronAPI) return "dev";
  try {
    return await unwrap(window.electronAPI.getAppVersion());
  } catch {
    return "dev";
  }
}

/**
 * 동기 헬퍼: process.platform 류 정보를 안전하게 반환한다.
 * api.ts 밖에서는 window.electronAPI 를 직접 참조하지 말고 이 함수를 사용.
 * - Electron 환경: "darwin" | "win32" | "linux" 등
 * - 그 외:        "web"
 * - SSR (window 미정의): "unknown"
 */
export function getPlatform(): string {
  if (typeof window === "undefined") return "unknown";
  const api = window.electronAPI;
  if (api && typeof api.platform === "string" && api.platform) {
    return api.platform;
  }
  return "web";
}

// ── Regenerate (Step 6b) ──

export async function regenerateAll(
  prev: GenerationResponse,
  opts?: RegenerateOpts
): Promise<GenerationResponse> {
  return unwrap(_api().regenerateAll(prev, opts));
}

export async function regenerateSet(
  prev: GenerationResponse,
  setKey: string,
  opts?: RegenerateOpts
): Promise<GenerationResponse> {
  return unwrap(_api().regenerateSet(prev, setKey, opts));
}

export async function regenerateTitle(
  prev: GenerationResponse,
  setKey: string,
  opts?: RegenerateOpts
): Promise<GenerationResponse> {
  return unwrap(_api().regenerateTitle(prev, setKey, opts));
}

export async function regenerateThumbnail(
  prev: GenerationResponse,
  setKey: string,
  opts?: RegenerateOpts
): Promise<GenerationResponse> {
  return unwrap(_api().regenerateThumbnail(prev, setKey, opts));
}

export async function regenerateTags(
  prev: GenerationResponse,
  setKey: string,
  opts?: RegenerateOpts
): Promise<GenerationResponse> {
  return unwrap(_api().regenerateTags(prev, setKey, opts));
}

// ── Favorites (Step 6b) ──

export async function addFavorite(
  record: FavoriteRecord
): Promise<{ total: number }> {
  return unwrap(_api().addFavorite(record));
}

export async function removeFavorite(id: string): Promise<boolean> {
  return unwrap(_api().removeFavorite(id));
}

export async function listFavorites(): Promise<FavoriteRecord[]> {
  return unwrap(_api().listFavorites());
}

export async function hasFavorite(id: string): Promise<boolean> {
  return unwrap(_api().hasFavorite(id));
}

// ── History extras (Step 6b) ──

export async function getHistoryDetail(
  id: string
): Promise<GenerationResponse | null> {
  return unwrap(_api().getHistoryDetail(id));
}

export async function removeHistory(id: string): Promise<boolean> {
  return unwrap(_api().removeHistory(id));
}

// ── Export (Step 6b) ──

export async function exportJSON(
  response: GenerationResponse
): Promise<string> {
  return unwrap(_api().exportJSON(response));
}

export async function exportCSV(
  response: GenerationResponse
): Promise<string> {
  return unwrap(_api().exportCSV(response));
}

export async function exportTXT(
  response: GenerationResponse
): Promise<string> {
  return unwrap(_api().exportTXT(response));
}

export async function suggestExportFilename(
  response: GenerationResponse,
  ext: string
): Promise<string> {
  return unwrap(_api().suggestExportFilename(response, ext));
}

/**
 * 사용자에게 저장 다이얼로그를 띄우고 응답을 파일로 저장한다.
 * 사용자가 다이얼로그를 닫으면 { cancelled: true }, 저장에 성공하면
 * { cancelled: false, filePath } 를 돌려준다. IPC envelope의 ok:false는
 * 저장 실패(쓰기 오류 등)에서만 발생.
 */
export async function saveExport(
  response: GenerationResponse,
  format: ExportFormat
): Promise<SaveExportResult> {
  return unwrap(_api().saveExport(response, format));
}
