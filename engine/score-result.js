/**
 * Per-Result-Set SEO Scoring
 *
 * 감성형/검색형/롱테일형 결과 카드마다 실제 제목 품질을 기준으로
 * 0~100 SEO 점수를 산출한다. 카드 유형별 가중치 프로필이 다르다.
 *
 * 입력: ytMusicTitle, ytPlaylistTitle, setLabel, analysis, language
 * 출력: { seoScore: 0~100, breakdown: [{key,label,score,weight}], profileKey }
 *
 * 두 제목(YT Music + YT Playlist)을 각각 채점한 뒤 평균을 카드 점수로 사용한다.
 */

"use strict";

const {
  classifyKeyword,
  competitionScore,
  specificityScore,
  hasGenreAnchor,
  scoreKeyword,
} = require("./keyword-engine");
const { classifyIntent, intentMatchScore } = require("./intent-classifier");
const { isTitleConsistent } = require("./coherence");

// ── 가중치 프로필 ────────────────────────────────────────────────────────
// 각 sub-score는 0~1로 정규화되어 있고, weights 합은 약 1.0.
// spamRisk와 inconsistency는 별도 페널티로 감산된다.
const PROFILES = {
  emotional: {
    label: "감성형",
    weights: {
      moodMatch:      0.22,
      ctrAppeal:      0.18,
      genreAnchor:    0.12,
      lengthFit:      0.10,
      titleClarity:   0.10,
      specificity:    0.08,
      seoSignal:      0.07,
      lowCompetition: 0.05,
      searchIntent:   0.04,
      genreMatch:     0.04,
    },
  },
  search: {
    label: "검색형",
    weights: {
      searchIntent:   0.22,
      genreMatch:     0.18,
      genreAnchor:    0.14,
      seoSignal:      0.12,
      titleClarity:   0.08,
      lengthFit:      0.08,
      specificity:    0.06,
      lowCompetition: 0.05,
      moodMatch:      0.04,
      ctrAppeal:      0.03,
    },
  },
  longtail: {
    label: "롱테일형",
    weights: {
      specificity:    0.22,
      lowCompetition: 0.20,
      longTailBonus:  0.16,
      genreAnchor:    0.10,
      searchIntent:   0.08,
      titleClarity:   0.07,
      lengthFit:      0.06,
      seoSignal:      0.05,
      moodMatch:      0.04,
      genreMatch:     0.02,
    },
  },
};

const SET_LABEL_TO_PROFILE = {
  "감성형":           "emotional",
  "Emotional":        "emotional",
  "검색형":           "search",
  "Search-Optimized": "search",
  "롱테일형":         "longtail",
  "Long-Tail":        "longtail",
};

// ── CTR / SEO 시그널 사전 ────────────────────────────────────────────────

const CTR_KEYWORDS = [
  "감성", "감성적", "차분한", "몽환", "신나는", "에너지", "섹시한",
  "잔잔한", "파워풀", "텐션", "분위기 미치는", "듣기 좋은", "틀기 좋은",
  "포근한", "설레는",
  "energetic", "chill", "emotional", "dreamy", "sexy", "vibes", "mood",
  "feel", "powerful",
];

const SEO_KEYWORDS = [
  "플레이리스트", "모음", "추천", "bgm", "신곡", "히트곡", "명곡", "베스트",
  "playlist", "mix", "collection", "best", "top", "hits", "compilation",
  "2024", "2025",
];

// ── 개별 sub-score 계산 ─────────────────────────────────────────────────

function _ctrAppeal(title) {
  const low = title.toLowerCase();
  let hits = 0;
  for (const kw of CTR_KEYWORDS) {
    if (low.includes(kw.toLowerCase())) hits++;
    if (hits >= 2) break;
  }
  return Math.min(1, hits / 2);
}

function _seoSignal(title) {
  const low = title.toLowerCase();
  let hits = 0;
  for (const kw of SEO_KEYWORDS) {
    if (low.includes(kw.toLowerCase())) hits++;
    if (hits >= 2) break;
  }
  return Math.min(1, hits / 2);
}

function _lengthFit(title, language) {
  // YouTube 검색 노출 기준의 적정 길이.
  // 한국어/혼합: 12~30자 만점, 영어: 30~70자 만점.
  const len = title.length;
  if (language === "en") {
    if (len >= 30 && len <= 70) return 1.0;
    if (len >= 22 && len <= 90) return 0.75;
    if (len >= 14 && len <= 110) return 0.45;
    return 0.2;
  }
  if (len >= 12 && len <= 30) return 1.0;
  if (len >= 8 && len <= 40) return 0.75;
  if (len >= 5 && len <= 55) return 0.45;
  return 0.2;
}

function _titleClarity(title, analysis) {
  // 장르/무드/상황 중 제목에 직접 표기된 차원 수 + 단어 수 적정성
  const low = title.toLowerCase();
  let dims = 0;
  if (low.includes((analysis.primaryGenre || "").toLowerCase())) dims++;
  if (low.includes((analysis.primaryMood || "").toLowerCase())) dims++;
  const sitNorm = (analysis.primarySituation || "").replace(/_/g, " ").toLowerCase();
  if (sitNorm && low.includes(sitNorm)) dims++;
  const wordCount = title.split(/\s+/).filter(Boolean).length;
  let wordPenalty = 1.0;
  if (wordCount < 2) wordPenalty = 0.5;
  else if (wordCount > 12) wordPenalty = 0.7;
  // dims 0이라도 어떤 의미든 있으면 0이 아니도록 base 0.1
  const dimScore = dims === 0 ? 0.1 : 0.4 + 0.2 * dims;
  return Math.min(1, dimScore * wordPenalty);
}

function _longTailBonus(title) {
  const t = classifyKeyword(title);
  if (t === "long-tail") return 1.0;
  if (t === "mid-tail") return 0.55;
  return 0.0;
}

// 단일 제목의 모든 sub-score (0~1) 계산
function computeSubScores(title, analysis, language) {
  const ks = scoreKeyword(title, analysis);
  const lang = language || analysis.language;
  return {
    moodMatch:      ks.moodMatch,
    genreMatch:     ks.genreMatch,
    genreAnchor:    hasGenreAnchor(title) ? 1.0 : 0.0,
    searchIntent:   intentMatchScore(title, analysis.primarySituation),
    specificity:    Math.min(1, specificityScore(title).dimensions / 3),
    lowCompetition: 1 - competitionScore(title),
    longTailBonus:  _longTailBonus(title),
    ctrAppeal:      _ctrAppeal(title),
    seoSignal:      _seoSignal(title),
    titleClarity:   _titleClarity(title, analysis),
    lengthFit:      _lengthFit(title, lang),
    spamRisk:       ks.spamRisk,
    _meta: {
      intent: classifyIntent(title),
      kwType: classifyKeyword(title),
      dimensions: specificityScore(title).dimensions,
      competition: competitionScore(title),
    },
  };
}

function _aggregate(sub, weights, situation, title) {
  let total = 0;
  for (const [k, w] of Object.entries(weights)) {
    total += (sub[k] || 0) * w;
  }
  // 페널티: 스팸 키워드 / 상황 충돌
  total -= (sub.spamRisk || 0) * 0.20;
  if (situation && !isTitleConsistent(situation, title)) total -= 0.10;
  return Math.max(0, Math.min(1, total));
}

const SUBSCORE_LABELS_KO = {
  moodMatch:      "분위기 매칭",
  genreMatch:     "장르 매칭",
  genreAnchor:    "장르 앵커",
  searchIntent:   "검색 의도",
  specificity:    "구체성",
  lowCompetition: "경쟁도(낮음 우대)",
  longTailBonus:  "롱테일 구조",
  ctrAppeal:      "CTR 매력",
  seoSignal:      "SEO 신호",
  titleClarity:   "제목 명확성",
  lengthFit:      "길이 적정성",
};

/**
 * 결과 세트 한 개의 점수와 breakdown을 계산한다.
 * @param {{ ytMusicTitle: string, ytPlaylistTitle: string, setLabel: string,
 *           analysis: object, language?: string }} args
 * @returns {{ seoScore: number, breakdown: Array<{key,label,score,weight}>, profileKey: string }}
 */
function scoreResultSet({ ytMusicTitle, ytPlaylistTitle, setLabel, analysis, language }) {
  const profileKey = SET_LABEL_TO_PROFILE[setLabel] || "emotional";
  const profile = PROFILES[profileKey];

  const titles = [ytMusicTitle, ytPlaylistTitle].filter(t => t && t.trim());
  if (!titles.length) {
    return { seoScore: 0, breakdown: [], profileKey };
  }

  const subSum = {};
  let aggSum = 0;
  for (const t of titles) {
    const sub = computeSubScores(t, analysis, language);
    for (const [k, v] of Object.entries(sub)) {
      if (k.startsWith("_") || typeof v !== "number") continue;
      subSum[k] = (subSum[k] || 0) + v;
    }
    aggSum += _aggregate(sub, profile.weights, analysis.primarySituation, t);
  }

  const subAvg = {};
  for (const [k, v] of Object.entries(subSum)) {
    subAvg[k] = v / titles.length;
  }

  const seoScore = +((aggSum / titles.length) * 100).toFixed(1);

  const breakdown = Object.entries(profile.weights)
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => ({
      key: k,
      label: SUBSCORE_LABELS_KO[k] || k,
      score: Math.round((subAvg[k] || 0) * 100),
      weight: Math.round(w * 100),
    }));

  return { seoScore, breakdown, profileKey };
}

module.exports = {
  scoreResultSet,
  computeSubScores,
  PROFILES,
  SUBSCORE_LABELS_KO,
};
