const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Analysis {
  detected_genres: string[];
  detected_moods: string[];
  detected_situations: string[];
  primary_genre: string;
  primary_mood: string;
  primary_situation: string;
  language: string;
  top_artists: string[];
  keyword_pool: string[];
}

export interface KeywordScore {
  keyword: string;
  relevance: number;
  search_intent: number;
  mood_match: number;
  genre_match: number;
  spam_risk: number;
  total_score: number;
}

export interface ThumbnailSuggestion {
  main_keywords: string[];
  sub_keywords: string[];
  color_tone: string[];
  background_concept: string;
  has_person: boolean;
  layout: string;
  text_overlay: string;
}

export interface ResultSet {
  set_label: string;
  yt_music_title: string;
  yt_playlist_title: string;
  thumbnail: ThumbnailSuggestion;
  seo_score: number;
}

export interface GenerationResponse {
  analysis: Analysis;
  keyword_scores: KeywordScore[];
  results: ResultSet[];
  generation_id: string;
}

export interface LinkInput {
  url: string;
  language?: string;
  override_genre?: string;
  override_mood?: string;
  override_situation?: string;
  exclude_keywords?: string[];
}

export interface ManualInput {
  genre: string;
  mood: string;
  situation: string;
  language: string;
  emotion?: string;
  reference_artists?: string[];
  exclude_keywords?: string[];
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "요청 처리 중 오류가 발생했습니다.";
    try {
      const err = await res.json();
      detail = err.detail || detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function generateFromLink(
  input: LinkInput
): Promise<GenerationResponse> {
  const res = await fetch(`${API_BASE}/api/v1/generate/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<GenerationResponse>(res);
}

export async function generateFromManual(
  input: ManualInput
): Promise<GenerationResponse> {
  const res = await fetch(`${API_BASE}/api/v1/generate/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handleResponse<GenerationResponse>(res);
}

export async function regenerate(
  generationId: string
): Promise<GenerationResponse> {
  const res = await fetch(
    `${API_BASE}/api/v1/generate/regenerate/${generationId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
  return handleResponse<GenerationResponse>(res);
}

export async function getHistory(): Promise<GenerationResponse[]> {
  const res = await fetch(`${API_BASE}/api/v1/history`);
  return handleResponse<GenerationResponse[]>(res);
}
