/**
 * Title Generator (Node.js)
 * 3-set generation: 감성형 / 검색형 / 롱테일형
 */

const path = require("path");
const fs = require("fs");
const { pickCompatibleMood, isTitleConsistent } = require("./coherence");
const { classifyKeyword, specificityScore, hasGenreAnchor, genreAnchorScore, rewriteBroadPhrase } = require("./keyword-engine");
const { classifyIntent } = require("./intent-classifier");

let _dict = null;
function loadDict() {
  if (!_dict) _dict = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "app", "data", "keyword_dictionary.json"), "utf-8"));
  return _dict;
}

function pickDisplayKeyword(key, section, lang) {
  const d = loadDict();
  const dispSec = { genres: "genre_display", moods: "mood_display", situations: "situation_display" }[section];
  if (dispSec) { const v = ((d.language_variants || {})[lang] || {})[dispSec] || {}; if (v[key]) return v[key]; }
  const e = (d[section] || {})[key] || {};
  const pool = lang === "ko" ? (e.ko_keywords || []) : (e.en_keywords || []);
  return pool[0] || key.replace(/_/g, " ");
}

// ── patterns ──
const YTM_KO = ["{sit} {genre}","{mood} {genre}","{mood} {sit} {genre}","{sit} {mood} 음악","{mood} {genre} 모음","{sit} 감성 {genre}","{mood} 느낌 {genre}","{genre} {sit} 믹스"];
const YTM_EN = ["{mood} {genre}","{sit} {genre}","{mood} {genre} mix","{sit} {mood} {genre}","{genre} for {sit}","{mood} {genre} vibes","{sit} {genre} beats","{mood} {sit} music"];
const YTP_KO = ["{sit}에 듣기 좋은 {mood} {genre} 플레이리스트","{sit} 때 분위기 살려주는 {mood} {genre} 모음","{mood} 감성의 {genre} 노래 모음 | {sit}용","{sit} 분위기에 어울리는 {mood} {genre} 플레이리스트","{mood} 느낌 가득한 {genre} 플레이리스트 | {sit}","듣기만 해도 좋은 {mood} {genre} 모음 | {sit}","{sit} {mood} {genre} 플레이리스트 추천","{mood} 분위기의 {genre} 모음 | {sit} 추천 플레이리스트","{sit}할 때 빠져드는 {mood} {genre} 노래 모음","{genre} 좋아한다면 꼭 들어야 할 {mood} 플레이리스트"];
const YTP_EN = ["{mood} {genre} playlist for {sit}","best {mood} {genre} songs for {sit}","{mood} {genre} mix | perfect for {sit}","{sit} vibes – {mood} {genre} playlist","the ultimate {mood} {genre} playlist | {sit} edition","{mood} {genre} collection for your {sit} moments","{genre} songs that feel {mood} | {sit} playlist","{sit} mood – curated {mood} {genre} mix","feel the {mood} vibes | {genre} playlist for {sit}","top {mood} {genre} tracks for {sit}"];

function _genTitles(patterns, genre, mood, sit, analysis, count) {
  const titles = patterns.map(p => p.replace(/\{genre\}/g, genre).replace(/\{mood\}/g, mood).replace(/\{sit\}/g, sit));
  const d = loadDict();
  const sec = patterns === YTM_KO || patterns === YTM_EN ? "yt_music" : "yt_playlist";
  const lang = patterns === YTM_KO || patterns === YTP_KO ? "ko" : "en";
  for (const tmpl of ((d.title_templates || {})[sec] || {})[lang] || []) {
    try { const t = tmpl.replace(/\{genre\}/g, genre).replace(/\{mood\}/g, mood).replace(/\{situation\}/g, sit).replace(/\{keyword\}/g, genre); if (!titles.includes(t)) titles.push(t); } catch (_) {}
  }
  const seen = new Set();
  return titles.filter(t => { const l = t.toLowerCase(); if (seen.has(l) || !isTitleConsistent(analysis.primarySituation, t)) return false; seen.add(l); return true; }).slice(0, count);
}

// ── intent policy ──
const POLICY = {
  emotional: { allow: new Set(["mood","discovery"]), block: new Set(["creator","utility"]), fallback: new Set(["mood","discovery"]) },
  search: { allow: new Set(["discovery","utility"]), block: new Set(["creator"]), fallback: new Set(["discovery","utility","mood"]) },
  longtail: { allow: new Set(["utility","creator"]), block: new Set(["mood"]), fallback: new Set(["utility","creator","discovery"]) },
};

function _filterByIntentPolicy(titles, setType, situation) {
  const p = POLICY[setType] || {};
  let result = titles.filter(t => { const i = classifyIntent(t); return !p.block.has(i) && p.allow.has(i); });
  if (result.length >= 2) return result;
  for (const t of titles) { if (result.includes(t)) continue; const i = classifyIntent(t); if (!p.block.has(i) && p.fallback.has(i)) result.push(t); if (result.length >= 3) break; }
  return result;
}

function _purity(title, setType) {
  const i = classifyIntent(title);
  const p = POLICY[setType]; if (!p) return 0.5;
  if (p.allow.has(i)) return 1.0;
  if (p.fallback.has(i)) return 0.5;
  return 0.0;
}

function _pickKwHardFiltered(keywordScores, setType, targetTypes, situation, genre, count) {
  const p = POLICY[setType] || {};
  const isLT = setType === "longtail";
  const primary = [];
  for (const ks of keywordScores) {
    const kwType = classifyKeyword(ks.keyword);
    if (!targetTypes.includes(kwType)) continue;
    if (!isTitleConsistent(situation, ks.keyword)) continue;
    const intent = classifyIntent(ks.keyword);
    if (p.block && p.block.has(intent)) continue;
    if (isLT) {
      const { dimensions } = specificityScore(ks.keyword);
      if (dimensions < 2) continue;
      if (intent === "creator" && ks.keyword.split(/\s+/).length <= 3) continue;
      if (!hasGenreAnchor(ks.keyword)) continue;
    }
    const { score: spec } = specificityScore(ks.keyword);
    const ga = isLT ? genreAnchorScore(ks.keyword) : 0;
    const bonus = isLT ? spec + ga : 0;
    const s = ks.totalScore + (p.allow.has(intent) ? 0.1 : 0) + bonus;
    primary.push([ks.keyword, s]);
  }
  primary.sort((a, b) => b[1] - a[1]);
  const result = primary.slice(0, count).map(x => x[0]);
  if (result.length >= count) return result;
  // fallback
  for (const ks of keywordScores) {
    if (result.includes(ks.keyword)) continue;
    const kwType = classifyKeyword(ks.keyword);
    if (!targetTypes.includes(kwType) && kwType !== "mid-tail") continue;
    if (!isTitleConsistent(situation, ks.keyword)) continue;
    const intent = classifyIntent(ks.keyword);
    if (p.block && p.block.has(intent)) continue;
    let kw = ks.keyword;
    if (isLT && !hasGenreAnchor(kw)) {
      kw = rewriteBroadPhrase(kw, genre, "", "", "");
      if (!hasGenreAnchor(kw)) continue;
    }
    if (!result.includes(kw)) result.push(kw);
    if (result.length >= count) break;
  }
  return result;
}

let _gCache = "", _mCache = { mood: "", genre: "", sit: "" };

function _makePair(kws, genre, lang, sit, moodKey, genreKey) {
  if (!kws.length) return ["", ""];
  const rewritten = kws.map(kw => hasGenreAnchor(kw) ? kw : rewriteBroadPhrase(kw, genre, moodKey, genreKey, sit));
  let ytm = rewritten[0];
  let ytp = rewritten[0].toLowerCase().includes(genre.toLowerCase())
    ? `${rewritten[0]} ${lang === "ko" ? "플레이리스트" : "playlist"}`
    : `${rewritten[0]} | ${genre} ${lang === "ko" ? "플레이리스트" : "playlist"}`;
  if (rewritten.length > 1) ytp = `${rewritten[0]} | ${rewritten[1]}`;
  const { dimensions } = specificityScore(ytm);
  if (dimensions < 2 && rewritten.length > 1) { for (const alt of rewritten.slice(1)) { if (specificityScore(alt).dimensions >= 2) { ytm = alt; break; } } }
  if (!isTitleConsistent(sit, ytm)) ytm = "";
  if (!isTitleConsistent(sit, ytp)) ytp = "";
  return [ytm, ytp];
}

function generateTitleSets(analysis, keywordScores, language) {
  const sit = analysis.primarySituation;
  const genre = pickDisplayKeyword(analysis.primaryGenre, "genres", language);
  const compatMood = pickCompatibleMood(sit, analysis.detectedMoods);
  const mood = pickDisplayKeyword(compatMood, "moods", language);
  const sitDisp = pickDisplayKeyword(sit, "situations", language);

  const ytmPats = language === "ko" ? YTM_KO : YTM_EN;
  const ytpPats = language === "ko" ? YTP_KO : YTP_EN;
  const ytmPool = _genTitles(ytmPats, genre, mood, sitDisp, analysis, 12);
  const ytpPool = _genTitles(ytpPats, genre, mood, sitDisp, analysis, 12);

  // 감성형
  let ytmMood = _filterByIntentPolicy(ytmPool, "emotional", sit);
  let ytpMood = _filterByIntentPolicy(ytpPool, "emotional", sit);
  ytmMood.sort((a, b) => _purity(b, "emotional") - _purity(a, "emotional"));
  ytpMood.sort((a, b) => _purity(b, "emotional") - _purity(a, "emotional"));

  // 검색형
  const searchKws = _pickKwHardFiltered(keywordScores, "search", ["mid-tail","long-tail"], sit, genre, 3);
  const [searchYtm, searchYtp] = _makePair(searchKws, genre, language, sit, analysis.primaryMood, analysis.primaryGenre);

  // 롱테일형
  const ltKws = _pickKwHardFiltered(keywordScores, "longtail", ["long-tail","mid-tail"], sit, genre, 3);
  const [ltYtm, ltYtp] = _makePair(ltKws, genre, language, sit, analysis.primaryMood, analysis.primaryGenre);

  const labels = language === "ko" ? ["감성형","검색형","롱테일형"] : ["Emotional","Search-Optimized","Long-Tail"];

  return [
    { setLabel: labels[0], ytMusicTitle: (ytmMood[0] || ytmPool[0] || ""), ytPlaylistTitle: (ytpMood[0] || ytpPool[0] || "") },
    { setLabel: labels[1], ytMusicTitle: searchYtm || (ytmPool[1] || ytmPool[0] || ""), ytPlaylistTitle: searchYtp || (ytpPool[1] || ytpPool[0] || "") },
    { setLabel: labels[2], ytMusicTitle: ltYtm || (ytmPool[2] || ytmPool[0] || ""), ytPlaylistTitle: ltYtp || (ytpPool[2] || ytpPool[0] || "") },
  ];
}

module.exports = { generateTitleSets, pickDisplayKeyword };
