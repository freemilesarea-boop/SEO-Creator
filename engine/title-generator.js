/**
 * Title Generator (Node.js)
 * 3-set generation: 감성형 / 검색형 / 롱테일형
 *
 * 세트별 차별화 강화:
 * - emotional: mood/atmosphere 중심, "감성/몽환/잔잔한" 우선, utility 패턴 차단
 * - search: discovery/utility 중심 — genre + situation + playlist 키워드 명확
 * - longtail: situation context + mood + genre 조합 — 경쟁도 낮은 구체 표현
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { pickCompatibleMood, isTitleConsistent } = require("./coherence");
const {
  classifyKeyword,
  specificityScore,
  hasGenreAnchor,
  genreAnchorScore,
  rewriteBroadPhrase,
  competitionScore,
} = require("./keyword-engine");
const { classifyIntent, intentMatchScore } = require("./intent-classifier");
const { resolveGenre, resolveSituation } = require("./util/aliases");
const { validateTitle } = require("./util/validator");
const { hashSeed, makeRng, pickOne } = require("./util/seeded-random");

let _dict = null;
function loadDict() {
  if (!_dict) {
    _dict = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "keyword_dictionary.json"), "utf-8")
    );
  }
  return _dict;
}

function pickDisplayKeyword(key, section, lang) {
  const d = loadDict();
  const dispSec = { genres: "genre_display", moods: "mood_display", situations: "situation_display" }[section];
  const lookup = section === "genres" ? resolveGenre(key) : section === "situations" ? resolveSituation(key) : key;
  if (dispSec) {
    const v = ((d.language_variants || {})[lang] || {})[dispSec] || {};
    if (v[lookup]) return v[lookup];
  }
  const e = (d[section] || {})[lookup] || {};
  const pool = lang === "ko" ? (e.ko_keywords || []) : (e.en_keywords || []);
  return pool[0] || lookup.replace(/_/g, " ");
}

// ── 세트별 패턴 (차별화 강화) ──

// 감성형 — mood 중심, 검색어 색깔 약하게, 부드러운 만연체
const YTM_EMOTIONAL_KO = [
  "{mood} {genre}",
  "{mood} 느낌의 {genre}",
  "{sit} {mood} {genre}",
  "{mood} {genre} 모음",
  "{sit} 감성 {genre}",
];
const YTM_EMOTIONAL_EN = [
  "{mood} {genre} vibes",
  "{mood} {genre}",
  "{mood} {sit} {genre}",
  "{genre} for that {mood} feeling",
  "{mood} {genre} mood",
];
const YTP_EMOTIONAL_KO = [
  "{mood} 감성의 {genre} 노래 모음",
  "{mood} 느낌 가득한 {genre} 플레이리스트",
  "{sit}에 어울리는 {mood} {genre} 모음",
  "조용히 빠져드는 {mood} {genre} 플레이리스트",
  "{mood} 분위기로 채운 {genre} 플레이리스트",
  "마음이 차분해지는 {mood} {genre} 모음",
];
const YTP_EMOTIONAL_EN = [
  "{mood} {genre} vibes for the soul",
  "soft {mood} {genre} | playlist for {sit}",
  "{mood} {genre} | a quiet evening playlist",
  "fall into the {mood} mood | {genre} mix",
  "{mood} {genre} essentials | curated for you",
];

// 검색형 — discovery + utility 중심. 명확한 키워드.
const YTM_SEARCH_KO = [
  "{sit} {genre} 플레이리스트",
  "{sit} {genre} 추천",
  "{genre} {sit} BGM",
  "{sit} {genre} 모음",
  "{genre} 플레이리스트 {sit}",
];
const YTM_SEARCH_EN = [
  "{genre} for {sit}",
  "{sit} {genre} playlist",
  "best {genre} for {sit}",
  "{genre} {sit} mix",
  "{genre} hits for {sit}",
];
const YTP_SEARCH_KO = [
  "{sit}할 때 듣기 좋은 {genre} 플레이리스트 추천",
  "{sit} {genre} 플레이리스트 | 검색하기 좋은 모음",
  "{sit}에 듣는 {genre} 노래 모음 BEST",
  "{genre} 플레이리스트 추천 | {sit}용 BGM",
  "{genre} 인기곡 모음 | {sit}에 어울리는 플레이리스트",
];
const YTP_SEARCH_EN = [
  "best {genre} playlist for {sit} | top picks",
  "{genre} songs for {sit} | curated playlist",
  "top {genre} hits for {sit} | playlist 2025",
  "{genre} playlist {sit} | most searched",
  "essential {genre} mix for {sit}",
];

// 롱테일형 — 구체 상황 + mood + genre. 경쟁도 낮음.
const SIT_CTX_KO = {
  workout: ["헬스장에서", "러닝할 때", "운동할 때", "웨이트할 때"],
  study: ["공부할 때", "도서관에서", "시험기간에", "집중할 때"],
  night_drive: ["밤 드라이브할 때", "야간 운전할 때", "새벽 드라이브에서"],
  cafe: ["카페에서", "커피숍에서", "카페 배경음악으로"],
  sleep: ["잠잘 때", "자기 전에", "수면용으로"],
  rain: ["비 오는 날에", "비 오는 밤에", "장마철에"],
  late_night: ["새벽에", "밤에 혼자", "심야에"],
  morning: ["아침에", "기상할 때", "출근 전에"],
  party: ["파티할 때", "클럽에서", "불금에"],
  walk: ["산책할 때", "걸을 때", "조깅할 때"],
  commute: ["출퇴근할 때", "지하철에서", "버스에서"],
  cooking: ["요리할 때", "주말 브런치에", "주방에서"],
  reading: ["책 읽을 때", "서재에서", "북카페에서"],
};
const SIT_CTX_EN = {
  workout: ["at the gym", "while running", "during a workout"],
  study: ["while studying", "at the library", "during exam prep"],
  night_drive: ["on a late night drive", "driving at midnight"],
  cafe: ["at a coffee shop", "for a cafe afternoon"],
  sleep: ["before bed", "for deep sleep"],
  rain: ["on a rainy day", "during a rainy night"],
  late_night: ["at 3am", "late at night"],
  morning: ["in the morning", "to start your day"],
  party: ["at the party", "for a club night"],
  walk: ["while walking", "for an evening stroll"],
  commute: ["during the morning commute", "on the subway"],
  cooking: ["while cooking", "for a sunday brunch"],
  reading: ["while reading", "for a quiet evening"],
};

const YTP_LONGTAIL_KO = [
  "{ctx} 듣기 좋은 {mood} {genre} 플레이리스트",
  "{ctx} 듣는 {mood} {genre} 노래 모음",
  "{ctx} 분위기 미치는 {mood} {genre}",
  "{ctx} 어울리는 {mood} {genre} 플레이리스트 추천",
  "{ctx} 들으면 좋은 {mood} {genre} 모음",
];
const YTP_LONGTAIL_EN = [
  "{mood} {genre} playlist {ctx}",
  "{mood} {genre} for {ctx} | low key vibes",
  "best {mood} {genre} {ctx} | hand-picked",
  "{genre} songs to listen {ctx} | {mood} mix",
];
const YTM_LONGTAIL_KO = [
  "{ctx} 듣는 {mood} {genre}",
  "{ctx} {mood} {genre}",
  "{ctx} 어울리는 {genre}",
];
const YTM_LONGTAIL_EN = [
  "{mood} {genre} {ctx}",
  "{genre} {ctx}",
];

// ── helpers ──

function _format(pat, vars) {
  return pat
    .replace(/\{genre\}/g, vars.genre)
    .replace(/\{mood\}/g, vars.mood)
    .replace(/\{sit\}/g, vars.sit)
    .replace(/\{ctx\}/g, vars.ctx || vars.sit);
}

function _applyValidation(title, situation, language, kind) {
  const v = validateTitle(title, { situation, language, kind });
  return v;
}

function _generatePool(patterns, vars, situation, language, kind, count) {
  const seen = new Set();
  const out = [];
  for (const pat of patterns) {
    let t = _format(pat, vars).trim();
    const v = _applyValidation(t, situation, language, kind);
    if (!v.valid) continue;
    const k = v.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v.title);
    if (out.length >= count) break;
  }
  return out;
}

// ── 세트 생성 ──

function _emotionalSet(analysis, language, rng) {
  const sit = analysis.primarySituation;
  const genre = pickDisplayKeyword(analysis.primaryGenre, "genres", language);
  const mood = pickDisplayKeyword(
    pickCompatibleMood(sit, analysis.detectedMoods),
    "moods",
    language
  );
  const sitDisp = pickDisplayKeyword(sit, "situations", language);
  const vars = { genre, mood, sit: sitDisp };

  const ytmPool = _generatePool(
    language === "ko" ? YTM_EMOTIONAL_KO : YTM_EMOTIONAL_EN,
    vars, sit, language, "ytm", 8
  );
  const ytpPool = _generatePool(
    language === "ko" ? YTP_EMOTIONAL_KO : YTP_EMOTIONAL_EN,
    vars, sit, language, "ytp", 8
  );
  const ytm = ytmPool[Math.floor(rng() * ytmPool.length)] || "";
  const ytp = ytpPool[Math.floor(rng() * ytpPool.length)] || "";
  const usedKeywords = [genre, mood, sitDisp].filter(Boolean);
  return { ytm, ytp, usedKeywords, intent: "mood" };
}

function _searchSet(analysis, keywordScores, language, rng) {
  const sit = analysis.primarySituation;
  const genre = pickDisplayKeyword(analysis.primaryGenre, "genres", language);
  const sitDisp = pickDisplayKeyword(sit, "situations", language);
  const mood = pickDisplayKeyword(
    pickCompatibleMood(sit, analysis.detectedMoods),
    "moods",
    language
  );

  const vars = { genre, mood, sit: sitDisp };
  const ytmPool = _generatePool(
    language === "ko" ? YTM_SEARCH_KO : YTM_SEARCH_EN,
    vars, sit, language, "ytm", 8
  );
  const ytpPool = _generatePool(
    language === "ko" ? YTP_SEARCH_KO : YTP_SEARCH_EN,
    vars, sit, language, "ytp", 8
  );

  // discovery/utility intent의 mid-tail 키워드를 골라 검색형에 보강
  const searchKws = (keywordScores || [])
    .filter((ks) => {
      const t = classifyKeyword(ks.keyword);
      const i = classifyIntent(ks.keyword);
      return (t === "mid-tail" || t === "long-tail")
        && (i === "discovery" || i === "utility")
        && isTitleConsistent(sit, ks.keyword);
    })
    .slice(0, 6)
    .map((k) => k.keyword);

  const ytm = ytmPool[Math.floor(rng() * ytmPool.length)] || "";
  const ytp = ytpPool[Math.floor(rng() * ytpPool.length)] || "";

  const usedKeywords = [genre, sitDisp, "playlist"].concat(searchKws.slice(0, 2));
  return { ytm, ytp, usedKeywords, intent: "discovery" };
}

function _longtailSet(analysis, keywordScores, language, rng) {
  const sit = analysis.primarySituation;
  const genre = pickDisplayKeyword(analysis.primaryGenre, "genres", language);
  const mood = pickDisplayKeyword(
    pickCompatibleMood(sit, analysis.detectedMoods),
    "moods",
    language
  );
  const ctxList = language === "ko" ? (SIT_CTX_KO[sit] || []) : (SIT_CTX_EN[sit] || []);
  const ctx = ctxList[Math.floor(rng() * Math.max(1, ctxList.length))] || pickDisplayKeyword(sit, "situations", language);

  const vars = { genre, mood, sit: pickDisplayKeyword(sit, "situations", language), ctx };
  const ytmPool = _generatePool(
    language === "ko" ? YTM_LONGTAIL_KO : YTM_LONGTAIL_EN,
    vars, sit, language, "ytm", 6
  );
  const ytpPool = _generatePool(
    language === "ko" ? YTP_LONGTAIL_KO : YTP_LONGTAIL_EN,
    vars, sit, language, "ytp", 8
  );

  // long-tail 후보 키워드 (genre anchor + 2dim spec) 추출
  const longCandidates = (keywordScores || [])
    .filter((ks) => {
      const t = classifyKeyword(ks.keyword);
      const { dimensions } = specificityScore(ks.keyword);
      return t === "long-tail"
        && dimensions >= 2
        && hasGenreAnchor(ks.keyword)
        && isTitleConsistent(sit, ks.keyword);
    })
    .slice(0, 6)
    .map((k) => k.keyword);

  const ytm = ytmPool[Math.floor(rng() * ytmPool.length)] || "";
  let ytp = ytpPool[Math.floor(rng() * ytpPool.length)] || "";

  // 후보 키워드가 있으면 ytp 풀에 prepend (더 구체적인 키워드 우선)
  if (longCandidates.length) {
    const candidate = longCandidates[Math.floor(rng() * longCandidates.length)];
    const v = validateTitle(candidate, { situation: sit, language, kind: "ytp" });
    if (v.valid && v.title.length >= 14) ytp = v.title;
  }

  const usedKeywords = [ctx, mood, genre].concat(longCandidates.slice(0, 2));
  return { ytm, ytp, usedKeywords, intent: "utility" };
}

// ── 공개 API ──

/**
 * Generate three differentiated title sets (deterministic via seed).
 * @param {object} analysis
 * @param {Array<object>} keywordScores
 * @param {"ko"|"en"|"mixed"} language
 * @param {number} seed uint32 deterministic seed
 * @returns {Array<{setLabel:string, setKey:string, ytMusicTitle:string, ytPlaylistTitle:string, usedKeywords:string[], intent:string}>}
 */
function generateTitleSets(analysis, keywordScores, language, seed) {
  const rng = makeRng(seed >>> 0);
  const labels = language === "ko" ? ["감성형", "검색형", "롱테일형"] : ["Emotional", "Search-Optimized", "Long-Tail"];
  const sets = [
    { setKey: "emotional", setLabel: labels[0], ...(_emotionalSet(analysis, language, rng)) },
    { setKey: "search", setLabel: labels[1], ...(_searchSet(analysis, keywordScores, language, rng)) },
    { setKey: "longtail", setLabel: labels[2], ...(_longtailSet(analysis, keywordScores, language, rng)) },
  ];
  return sets.map((s) => ({
    setKey: s.setKey,
    setLabel: s.setLabel,
    ytMusicTitle: s.ytm,
    ytPlaylistTitle: s.ytp,
    usedKeywords: s.usedKeywords,
    intent: s.intent,
  }));
}

module.exports = { generateTitleSets, pickDisplayKeyword };
