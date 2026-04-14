/**
 * SEO Keyword Engine (Node.js)
 */

const path = require("path");
const fs = require("fs");

let _dict = null;
function loadDict() {
  if (!_dict) {
    const p = path.join(__dirname, "..", "backend", "app", "data", "keyword_dictionary.json");
    _dict = JSON.parse(fs.readFileSync(p, "utf-8"));
  }
  return _dict;
}

// ── helpers ──

function collectGenreKw(genre, lang) {
  const d = loadDict();
  const e = (d.genres || {})[genre] || {};
  return lang === "en" ? (e.en_keywords || []) : (e.ko_keywords || []);
}
function collectMoodKw(mood, lang) {
  const d = loadDict();
  const e = (d.moods || {})[mood] || {};
  return lang === "en" ? (e.en_keywords || []) : (e.ko_keywords || []);
}
function collectSituationKw(sit, lang) {
  const d = loadDict();
  const e = (d.situations || {})[sit] || {};
  return lang === "en" ? (e.en_keywords || []) : (e.ko_keywords || []);
}

// ── collect keywords ──

function collectKeywords(analysis) {
  const kws = [];
  for (const g of analysis.detectedGenres) kws.push(...collectGenreKw(g, analysis.language));
  for (const m of analysis.detectedMoods) kws.push(...collectMoodKw(m, analysis.language));
  for (const s of analysis.detectedSituations) kws.push(...collectSituationKw(s, analysis.language));
  kws.push(...(analysis.topArtists || []).slice(0, 3));
  kws.push(...(analysis.keywordPool || []));
  const seen = new Set();
  return kws.filter(k => { const l = k.toLowerCase().trim(); if (!l || seen.has(l)) return false; seen.add(l); return true; });
}

function generateCombinationKeywords(analysis) {
  const lang = analysis.language;
  const gk = collectGenreKw(analysis.primaryGenre, lang).slice(0, 2);
  const mk = collectMoodKw(analysis.primaryMood, lang).slice(0, 2);
  const sk = collectSituationKw(analysis.primarySituation, lang).slice(0, 2);
  const combos = [];
  for (const g of gk) for (const m of mk) combos.push(`${m} ${g}`);
  for (const g of gk) for (const s of sk) combos.push(`${s} ${g}`);
  for (const m of mk) for (const s of sk) combos.push(`${s} ${m}`);
  return [...new Set(combos)];
}

// ── situation contexts ──

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
};

function generateLongtailKeywords(analysis) {
  const lang = analysis.language;
  const g = (collectGenreKw(analysis.primaryGenre, lang)[0]) || analysis.primaryGenre;
  const m = (collectMoodKw(analysis.primaryMood, lang)[0]) || analysis.primaryMood;
  const s = (collectSituationKw(analysis.primarySituation, lang)[0]) || analysis.primarySituation;
  const results = [];
  if (lang === "ko") {
    results.push(`${m} ${g} 추천`, `${s} ${g} 노래 모음`, `${s} 분위기에 딱 맞는 ${g} 플레이리스트`,
      `${m} 느낌의 ${g} 노래 추천`, `${s} 분위기 ${g} 모음`, `${m} ${g} | ${s} 플레이리스트`);
    for (const ctx of (SIT_CTX_KO[analysis.primarySituation] || [])) {
      results.push(`${ctx} 듣기 좋은 ${g}`, `${ctx} 듣는 ${m} ${g} 모음`,
        `${ctx} 듣기 좋은 ${g} 플레이리스트`, `${ctx} 분위기 미치는 ${g}`);
    }
  } else {
    results.push(`${m} ${g} for ${s}`, `best ${m} ${g} playlist`, `${g} songs for ${s}`,
      `${m} ${g} mix for ${s}`, `${g} playlist for ${s} – ${m} vibes`,
      `the best ${g} to listen during ${s}`, `${m} ${g} collection | perfect for ${s}`);
  }
  return [...new Set(results)];
}

// ── classify ──

const GENERIC_WORDS = new Set(["노래","음악","추천","모음","플레이리스트","듣기","songs","music","playlist","mix","best","top","팝송"]);

function classifyKeyword(kw) {
  const words = kw.split(/\s+/);
  if (words.length <= 2) return "head";
  const genericCount = words.filter(w => GENERIC_WORDS.has(w)).length;
  if (genericCount >= words.length - 1) return "head";
  const charCount = kw.replace(/\s/g, "").length;
  if (charCount <= 6) return "head";
  if (words.length >= 5 || charCount >= 18) return "long-tail";
  return "mid-tail";
}

function competitionScore(kw) {
  const t = classifyKeyword(kw);
  let s = t === "head" ? 0.8 : t === "mid-tail" ? 0.4 : 0.15;
  const words = kw.split(/\s+/);
  s += words.filter(w => GENERIC_WORDS.has(w)).length * 0.1;
  if (kw.replace(/\s/g, "").length <= 8) s += 0.15;
  return Math.min(1, s);
}

// ── specificity ──

const SIT_MARKERS = ["운동","헬스","러닝","공부","카페","드라이브","수면","잠잘","비 오는","새벽","아침","파티","산책","출퇴근","여행","workout","gym","study","cafe","drive","sleep","rain","morning","party","walk","commute","travel","할 때","할때","에서"];
const GENRE_MARKERS = ["케이팝","k-pop","kpop","팝","pop","알앤비","rnb","r&b","힙합","hiphop","로파이","lofi","재즈","jazz","록","rock","발라드","ballad","인디","indie","클래식","classical","어쿠스틱","acoustic","시티팝","앰비언트"];
const CTX_MARKERS = ["듣기 좋은","틀기 좋은","배경음악","플레이리스트","bgm","playlist","노래 모음","음악 모음","용","추천","for","songs","mix","collection"];
const MOD_MARKERS = ["텐션 올라가는","분위기 미치는","신나는","차분한","감성","에너지","편안한","몽환적","섹시한","파워풀","energetic","chill","emotional","dreamy","vibes"];

function specificityScore(kw) {
  const low = kw.toLowerCase();
  let score = 0, dims = 0;
  if (SIT_MARKERS.some(m => low.includes(m))) { score += 0.08; dims++; }
  if (GENRE_MARKERS.some(m => low.includes(m))) { score += 0.08; dims++; }
  if (CTX_MARKERS.some(m => low.includes(m))) { score += 0.06; dims++; }
  if (MOD_MARKERS.some(m => low.includes(m))) { score += 0.05; dims++; }
  return { score, dimensions: dims };
}

// ── genre anchor ──

const GENRE_ANCHORS = new Set([...GENRE_MARKERS, "edm","라틴","latin","제이팝","jpop","ost"]);
const STYLE_ANCHORS = new Set(["chill","lofi","lo-fi","synthpop","synth","neo soul","소울","city pop","시티팝","보사노바","bossa nova","trap","boom bap","그루비","groovy","acoustic","어쿠스틱","소프트"]);
const MOOD_ANCHORS = new Set(["감성","몽환","에너지","차분","편안","신나는","섹시","emotional","dreamy","energetic","chill","mellow","vibes","mood","dark","romantic"]);
const BROAD_NOUNS = new Set(["노래","음악","뮤직","songs","music","tracks"]);

function hasGenreAnchor(kw) {
  const low = kw.toLowerCase();
  for (const a of [...GENRE_ANCHORS, ...STYLE_ANCHORS, ...MOOD_ANCHORS]) if (low.includes(a)) return true;
  return false;
}

function genreAnchorScore(kw) {
  const low = kw.toLowerCase();
  let s = 0;
  const hg = [...GENRE_ANCHORS].some(a => low.includes(a));
  const hs = [...STYLE_ANCHORS].some(a => low.includes(a));
  const hm = [...MOOD_ANCHORS].some(a => low.includes(a));
  if (hg) s += 0.10; if (hs) s += 0.08; if (hm) s += 0.05;
  if (hm && (hg || hs)) s += 0.05;
  if (s === 0 && [...BROAD_NOUNS].some(b => low.includes(b))) s -= 0.12;
  return s;
}

// ── mood genre pair ──

const PAIRS = {
  pop: { emotional: "감성 팝", happy: "청량한 팝", romantic: "로맨틱 팝", nostalgic: "추억의 팝", chill: "차분한 팝", dreamy: "몽환 팝" },
  kpop: { energetic: "신나는 케이팝", happy: "밝은 케이팝", emotional: "감성 케이팝", intense: "파워풀 케이팝" },
  rnb: { sexy: "섹시한 알앤비", emotional: "감성 알앤비", chill: "차분한 알앤비", dreamy: "몽환 알앤비", romantic: "로맨틱 알앤비" },
  lofi: { chill: "차분한 로파이", dreamy: "몽환 로파이", peaceful: "잔잔한 로파이", nostalgic: "레트로 로파이" },
  jazz: { chill: "차분한 재즈", romantic: "로맨틱 재즈", nostalgic: "빈티지 재즈" },
  ballad: { emotional: "감성 발라드", sad: "슬픈 발라드", romantic: "로맨틱 발라드" },
  indie: { dreamy: "몽환 인디", nostalgic: "레트로 인디", chill: "잔잔한 인디" },
  hiphop: { energetic: "신나는 힙합", dark: "다크 힙합", intense: "파워풀 힙합" },
  rock: { energetic: "에너지 록", intense: "파워풀 록", dark: "다크 록" },
  citypop: { nostalgic: "레트로 시티팝", dreamy: "몽환 시티팝", chill: "시티팝 감성" },
  acoustic: { peaceful: "잔잔한 어쿠스틱", romantic: "로맨틱 어쿠스틱", chill: "차분한 어쿠스틱" },
};
const UTIL_DOMINANT = { workout: new Set(["energetic","intense","happy"]), study: new Set(["chill","peaceful","dreamy"]), sleep: new Set(["peaceful","dreamy","chill"]) };

function getMoodGenrePair(genreKey, moodKey, situation) {
  if (UTIL_DOMINANT[situation] && !((UTIL_DOMINANT[situation]).has(moodKey))) return null;
  return (PAIRS[genreKey] || {})[moodKey] || null;
}

function rewriteBroadPhrase(kw, genreDisplay, moodKey, genreKey, situation) {
  let target = "";
  for (const b of ["노래","음악","뮤직"]) { if (kw.includes(b)) { target = b; break; } }
  if (!target) { for (const b of ["songs","music","tracks"]) { if (kw.toLowerCase().includes(b)) { target = b; break; } } }
  if (!target) return kw;
  let replacement = genreDisplay;
  if (moodKey && genreKey) { const pair = getMoodGenrePair(genreKey, moodKey, situation || ""); if (pair) replacement = pair; }
  return kw.replace(target, replacement);
}

// ── scoring ──

function _getDisplayNames(analysis) {
  const d = loadDict();
  const names = new Set();
  const lang = (analysis.language === "ko" || analysis.language === "en") ? analysis.language : "ko";
  const lv = ((d.language_variants || {})[lang] || {});
  for (const [sec, key] of [["genre_display", analysis.primaryGenre], ["mood_display", analysis.primaryMood], ["situation_display", analysis.primarySituation]]) {
    const v = (lv[sec] || {})[key]; if (v) names.add(v.toLowerCase());
  }
  for (const [sec, key] of [["genres", analysis.primaryGenre], ["moods", analysis.primaryMood], ["situations", analysis.primarySituation]]) {
    const e = (d[sec] || {})[key] || {};
    for (const kw of (e.ko_keywords || []).slice(0, 2)) names.add(kw.toLowerCase());
    for (const kw of (e.en_keywords || []).slice(0, 2)) names.add(kw.toLowerCase());
  }
  return names;
}

function scoreKeyword(keyword, analysis) {
  const low = keyword.toLowerCase();
  const poolLow = (analysis.keywordPool || []).map(k => k.toLowerCase());
  // relevance
  let relevance = 0;
  if (poolLow.includes(low)) relevance += 0.4;
  if (low.includes(analysis.primaryGenre.toLowerCase())) relevance += 0.2;
  if (low.includes(analysis.primaryMood.toLowerCase())) relevance += 0.2;
  if (low.includes(analysis.primarySituation.replace(/_/g, " ").toLowerCase())) relevance += 0.2;
  if (relevance < 0.6) { const dn = _getDisplayNames(analysis); for (const n of dn) if (low.includes(n) || n.includes(low)) { relevance += 0.3; break; } }
  relevance = Math.min(1, relevance);
  // search intent
  const words = keyword.split(/\s+/);
  const searchIntent = words.length < 2 ? 0.3 : words.length <= 4 ? 0.8 : 0.6;
  // mood/genre match
  const d = loadDict();
  let moodMatch = 0, genreMatch = 0;
  for (const m of analysis.detectedMoods) { if (low.includes(m.toLowerCase())) { moodMatch = 1; break; } }
  if (moodMatch === 0) { for (const m of analysis.detectedMoods) { for (const kw of ((d.moods || {})[m] || {}).ko_keywords || []) { if (low.includes(kw.toLowerCase())) { moodMatch = 0.8; break; } } if (moodMatch > 0) break; } }
  for (const g of analysis.detectedGenres) { if (low.includes(g.toLowerCase())) { genreMatch = 1; break; } }
  if (genreMatch === 0) { for (const g of analysis.detectedGenres) { for (const kw of ((d.genres || {})[g] || {}).ko_keywords || []) { if (low.includes(kw.toLowerCase())) { genreMatch = 0.8; break; } } if (genreMatch > 0) break; } }
  if (moodMatch === 0) moodMatch = relevance > 0.3 ? 0.3 : 0.1;
  if (genreMatch === 0) genreMatch = relevance > 0.3 ? 0.3 : 0.1;
  // spam
  const spamWords = ["미쳤","ㄹㅇ","실화","레전드","충격","극혐","개쩌는","insane","shocking","crazy","you won't believe"];
  const spamRisk = spamWords.some(w => low.includes(w)) ? 0.8 : 0.0;
  const total = Math.max(0, Math.min(1, relevance*0.30 + searchIntent*0.25 + moodMatch*0.15 + genreMatch*0.15 - spamRisk*0.15));
  return { keyword, relevance: +relevance.toFixed(3), searchIntent: +searchIntent.toFixed(3), moodMatch: +moodMatch.toFixed(3), genreMatch: +genreMatch.toFixed(3), spamRisk: +spamRisk.toFixed(3), totalScore: +total.toFixed(3) };
}

function scoreAllKeywords(keywords, analysis) {
  return keywords.map(kw => scoreKeyword(kw, analysis)).sort((a, b) => b.totalScore - a.totalScore);
}

module.exports = {
  collectKeywords, generateCombinationKeywords, generateLongtailKeywords,
  classifyKeyword, competitionScore, specificityScore,
  hasGenreAnchor, genreAnchorScore, rewriteBroadPhrase, getMoodGenrePair,
  scoreKeyword, scoreAllKeywords,
};
