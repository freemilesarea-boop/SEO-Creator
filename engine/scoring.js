/**
 * Scoring — 세트별 SEO 점수 + 보조 지표.
 *
 * 모든 점수는 0~100 정수/소수.
 * null/undefined 입력에도 죽지 않는다 (defensive).
 *
 * 외부 의존성: 같은 engine/ 내부 모듈만 사용. 신규 npm 패키지 없음.
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { classifyIntent, SITUATION_PREFERRED_INTENT } = require("./intent-classifier");
const { competitionScore, classifyKeyword } = require("./keyword-engine");
const { resolveSituation } = require("./util/aliases");

let _dict = null;
function _loadDict() {
  if (!_dict) {
    try {
      _dict = JSON.parse(
        fs.readFileSync(path.join(__dirname, "data", "keyword_dictionary.json"), "utf-8")
      );
    } catch (_) {
      _dict = {};
    }
  }
  return _dict;
}

// ── helpers ──
const _clamp = (n, lo = 0, hi = 100) => {
  if (typeof n !== "number" || Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
};
const _safeArr = (a) => (Array.isArray(a) ? a : []);
const _safeStr = (s) => (typeof s === "string" ? s : "");
const _tokens = (s) =>
  _safeStr(s).toLowerCase().split(/[\s|,/–—\-]+/).filter(Boolean);

// ── 1. intent fit (0~100) ──
function _intentFit(set, analysis) {
  if (!set) return 0;
  const sit = resolveSituation((analysis || {}).primarySituation || "");
  const preferred = SITUATION_PREFERRED_INTENT[sit] || ["discovery", "utility"];
  const setIntent = _safeStr(set.intent);
  let base = 40;
  if (setIntent && setIntent === preferred[0]) base = 100;
  else if (setIntent && preferred.includes(setIntent)) base = 70;

  let bonus = 0;
  if (set.ytMusicTitle && classifyIntent(_safeStr(set.ytMusicTitle)) === setIntent) bonus += 5;
  if (set.ytPlaylistTitle && classifyIntent(_safeStr(set.ytPlaylistTitle)) === setIntent) bonus += 5;
  return _clamp(base + bonus);
}

// ── 2. keyword coverage ──
function keywordCoverage(set, keywordScores) {
  if (!set) return 0;
  const used = _safeArr(set.usedKeywords)
    .map((s) => _safeStr(s).toLowerCase())
    .filter(Boolean);
  const top = _safeArr(keywordScores)
    .slice(0, 15)
    .map((k) => _safeStr(k && k.keyword).toLowerCase())
    .filter(Boolean);
  if (!used.length && !top.length) return 0;

  let hits = 0;
  for (const u of used) {
    for (const t of top) {
      if (t.includes(u) || u.includes(t)) {
        hits++;
        break;
      }
    }
  }

  const titleTokens = new Set([
    ..._tokens(set.ytMusicTitle),
    ..._tokens(set.ytPlaylistTitle),
  ]);
  let titleHits = 0;
  for (const t of top.slice(0, 10)) {
    if (_tokens(t).some((x) => titleTokens.has(x))) titleHits++;
  }

  const usedRatio = used.length ? Math.min(1, hits / Math.min(used.length, 5)) : 0;
  const titleRatio = top.length ? Math.min(1, titleHits / 6) : 0;
  if (!used.length && !top.length) return 0;
  if (!used.length) return _clamp(titleRatio * 70);
  return _clamp(usedRatio * 60 + titleRatio * 40);
}

// ── 3. title clickability ──
const EMO_WORDS = [
  "감성", "몽환", "잔잔", "차분", "설레", "따뜻", "쓸쓸", "외로",
  "chill", "emotional", "dreamy", "vibes", "mood", "aesthetic",
];
const SIT_WORDS = [
  "운동", "공부", "카페", "드라이브", "수면", "아침", "산책", "출퇴근",
  "파티", "독서", "요리", "비 오는", "새벽", "잠잘", "밤", "헬스",
  "workout", "study", "cafe", "drive", "sleep", "morning", "walk",
  "commute", "party", "reading", "cooking", "rain", "late night",
];
const GENERIC_BAD = ["노래", "음악", "music", "songs", "best", "top", "mix"];

function _scoreLength(title, kind) {
  const len = _safeStr(title).length;
  if (kind === "ytm") {
    if (len < 4) return 30;
    if (len <= 25) return 100;
    if (len <= 35) return 80;
    if (len <= 55) return 55;
    return 30;
  }
  if (len < 12) return 35;
  if (len <= 70) return 100;
  if (len <= 90) return 75;
  return 45;
}

function titleClickabilityScore(set) {
  if (!set) return 0;
  const ytm = _safeStr(set.ytMusicTitle);
  const ytp = _safeStr(set.ytPlaylistTitle);
  if (!ytm && !ytp) return 0;

  const lenScore = (_scoreLength(ytm, "ytm") + _scoreLength(ytp, "ytp")) / 2;
  const combined = (ytm + " " + ytp).toLowerCase();

  let bonus = 0;
  if (/\d/.test(combined)) bonus += 4;
  if (EMO_WORDS.some((w) => combined.includes(w))) bonus += 12;
  if (SIT_WORDS.some((w) => combined.includes(w))) bonus += 12;

  let penalty = 0;
  const tokens = combined.split(/\s+/).filter(Boolean);
  const genericCount = tokens.filter((t) => GENERIC_BAD.includes(t)).length;
  if (tokens.length && genericCount / tokens.length > 0.5) penalty += 15;

  const d = _loadDict();
  const bw = d.banned_words || {};
  const bwAll = [...(_safeArr(bw.ko)), ...(_safeArr(bw.en))];
  if (bwAll.some((w) => w && combined.includes(_safeStr(w).toLowerCase()))) penalty += 25;

  if (ytm && ytp) {
    const ytmType = classifyKeyword(ytm);
    const ytpType = classifyKeyword(ytp);
    if (ytmType === "head" && ytpType === "head") penalty += 10;
  }

  return _clamp(lenScore + bonus - penalty);
}

// ── 4. tag quality ──
function tagQualityScore(set, keywordScores) {
  if (!set) return 0;
  const dp = set.descriptionPack || {};
  const tags = _safeArr(dp.tags).map((s) => _safeStr(s).trim()).filter(Boolean);
  const hashtags = _safeArr(dp.hashtags).map((s) => _safeStr(s).trim()).filter(Boolean);
  if (!tags.length && !hashtags.length) return 30;

  // 중복
  const seen = new Set();
  let dup = 0;
  for (const t of tags) {
    const k = t.toLowerCase();
    if (seen.has(k)) dup++; else seen.add(k);
  }
  const seenH = new Set();
  let dupH = 0;
  for (const h of hashtags) {
    const k = h.toLowerCase();
    if (seenH.has(k)) dupH++; else seenH.add(k);
  }

  // 의미 없는/짧은 태그
  const meaningless = new Set(["the", "a", "an", "of", "to", "and", "or", "for"]);
  const tooShort = tags.filter((t) => {
    const norm = t.replace(/[^\p{L}\p{N}]/gu, "");
    return norm.length < 2 || meaningless.has(t.toLowerCase());
  }).length;

  // top keyword 연관성
  const top = _safeArr(keywordScores)
    .slice(0, 10)
    .map((k) => _safeStr(k && k.keyword).toLowerCase())
    .filter(Boolean);
  let related = 0;
  for (const t of tags) {
    const tl = t.toLowerCase();
    if (top.some((k) => k && (k.includes(tl) || tl.includes(k)))) related++;
  }
  const relRatio = tags.length ? related / Math.min(tags.length, 8) : 0;

  let base = 60;
  base += relRatio * 25;
  base -= dup * 5;
  base -= dupH * 4;
  base -= tooShort * 4;
  if (tags.length >= 6) base += 5;
  if (hashtags.length >= 3) base += 3;

  return _clamp(base);
}

// ── 5. thumbnail relevance ──
function thumbnailRelevance(thumbnail, analysis) {
  if (!thumbnail || typeof thumbnail !== "object") return 0;
  const d = _loadDict();
  const a = analysis || {};
  const sitKey = resolveSituation(a.primarySituation || "");
  const sitData = (d.situations || {})[sitKey] || {};
  const moodData = (d.moods || {})[a.primaryMood] || {};
  const genreData = (d.genres || {})[a.primaryGenre] || {};

  const expected = new Set(
    [
      ..._safeArr(sitData.visual_keywords),
      ..._safeArr(moodData.visual_concepts),
      ..._safeArr(genreData.visual_keywords),
    ]
      .map((s) => _safeStr(s).toLowerCase())
      .filter(Boolean)
  );
  if (!expected.size) return 50;

  const candidates = [
    ..._safeArr(thumbnail.mainKeywords),
    ..._safeArr(thumbnail.subKeywords),
    ..._safeArr(thumbnail.photoSearchKeywords),
    _safeStr(thumbnail.backgroundConcept),
  ]
    .map((s) => _safeStr(s).toLowerCase())
    .filter(Boolean);
  if (!candidates.length) return 30;

  let hits = 0;
  for (const c of candidates) {
    for (const e of expected) {
      if (e && (c.includes(e) || e.includes(c))) {
        hits++;
        break;
      }
    }
  }
  const ratio = Math.min(1, hits / Math.max(4, Math.floor(candidates.length / 2)));
  let score = ratio * 80 + 20;
  if (_safeArr(thumbnail.avoidList).length >= 3) score += 5;
  return _clamp(score);
}

// ── 6. competition bonus ──
function _competitionBonus(set) {
  if (!set) return 0;
  const ytp = _safeStr(set.ytPlaylistTitle);
  if (!ytp) return 0;
  const c = competitionScore(ytp); // 0=low(좋음), 1=high
  let s = (1 - c) * 100;
  if (set.intent === "utility" || set.intent === "creator") s += 10;
  if (set.setKey === "longtail") s += 5;
  return _clamp(s);
}

// ── 7. diversity ──
function _jaccardDistance(a, b) {
  const sA = new Set(a);
  const sB = new Set(b);
  if (!sA.size && !sB.size) return 0;
  let inter = 0;
  for (const x of sA) if (sB.has(x)) inter++;
  const union = sA.size + sB.size - inter;
  if (!union) return 0;
  return 1 - inter / union;
}

/**
 * @param {Array} sets
 * @returns {{ avg: number, perSet: Record<string, number> }} 0~100 distance
 */
function titleDiversity(sets) {
  const list = _safeArr(sets).filter(Boolean);
  const n = list.length;
  if (n < 2) return { avg: 0, perSet: {} };
  const tokens = list.map((s) => [..._tokens(s.ytMusicTitle), ..._tokens(s.ytPlaylistTitle)]);
  const dists = [];
  const sums = list.map(() => 0);
  const cnts = list.map(() => 0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = _jaccardDistance(tokens[i], tokens[j]);
      dists.push(d);
      sums[i] += d; cnts[i]++;
      sums[j] += d; cnts[j]++;
    }
  }
  const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
  const perSet = {};
  for (let i = 0; i < n; i++) {
    const key = list[i].setKey || `set${i}`;
    perSet[key] = cnts[i] ? Math.round((sums[i] / cnts[i]) * 100) : 0;
  }
  return { avg: Math.round(avg * 100), perSet };
}

// ── 8. perSetScore ──
const WEIGHTS = {
  intentFit: 25,
  keywordCoverage: 20,
  titleClickability: 20,
  tagQuality: 15,
  thumbnailRelevance: 10,
  competitionBonus: 5,
  diversityBonus: 5,
};

/**
 * @param {object} set
 * @param {object} analysis
 * @param {Array} keywordScores
 * @param {{ diversityBonus?: number }} [extra] 0~100 외부 주입 (없으면 0)
 * @returns {{ total: number, breakdown: object }}
 */
function perSetScore(set, analysis, keywordScores, extra) {
  if (!set) return { total: 0, breakdown: {} };

  const intentFit = _intentFit(set, analysis);
  const kwCov = keywordCoverage(set, keywordScores);
  const click = titleClickabilityScore(set);
  const tagQ = tagQualityScore(set, keywordScores);
  const thumb = thumbnailRelevance(set.thumbnail, analysis);
  const compB = _competitionBonus(set);
  const divB = extra && typeof extra.diversityBonus === "number" ? _clamp(extra.diversityBonus) : 0;

  const w = WEIGHTS;
  const total =
    (intentFit * w.intentFit) / 100 +
    (kwCov * w.keywordCoverage) / 100 +
    (click * w.titleClickability) / 100 +
    (tagQ * w.tagQuality) / 100 +
    (thumb * w.thumbnailRelevance) / 100 +
    (compB * w.competitionBonus) / 100 +
    (divB * w.diversityBonus) / 100;

  return {
    total: Math.round(total * 10) / 10,
    breakdown: {
      intentFit: Math.round(intentFit),
      keywordCoverage: Math.round(kwCov),
      titleClickability: Math.round(click),
      tagQuality: Math.round(tagQ),
      thumbnailRelevance: Math.round(thumb),
      competitionBonus: Math.round(compB),
      diversityBonus: Math.round(divB),
    },
  };
}

module.exports = {
  perSetScore,
  keywordCoverage,
  titleDiversity,
  thumbnailRelevance,
  titleClickabilityScore,
  tagQualityScore,
  WEIGHTS,
};
