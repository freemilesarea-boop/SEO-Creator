/**
 * Thumbnail Generator (Node.js)
 *
 * - situation-first
 * - seeded RNG (같은 입력 → 같은 결과)
 * - 풍부한 출력: 폰트 느낌, 피해야 할 요소, Unsplash/Pexels 검색 키워드
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { pickCompatibleMood, filterVisualsForSituation, getSituationVisuals, SITUATION_VISUAL_BLOCK } = require("./coherence");
const { resolveGenre, resolveSituation } = require("./util/aliases");
const { makeRng, pickOne } = require("./util/seeded-random");

let _dict = null;
function loadDict() {
  if (!_dict) {
    _dict = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "keyword_dictionary.json"), "utf-8")
    );
  }
  return _dict;
}

// ── 폰트 느낌 (situation × mood) ──
const FONT_FEEL = {
  workout:    "굵은 산세리프 + 대문자, 강한 무게감",
  party:      "굵은 디스플레이 + 네온 효과",
  study:      "얇은 산세리프 + 여백, 미니멀",
  sleep:      "얇은 세리프 + 큰 자간, 부드러움",
  cafe:       "필기체 또는 따뜻한 세리프, 손글씨 느낌",
  night_drive:"콘덴스드 산세리프 + 시네마틱",
  late_night: "콘덴스드 세리프 + 글로우, 미스터리",
  rain:       "얇은 세리프 + 손글씨, 차분함",
  morning:    "라운드 산세리프, 밝고 부드러움",
  walk:       "라운드 산세리프 + 캐주얼",
  commute:    "산세리프 + 또렷한 자간",
  reading:    "북 세리프, 클래식한 글씨",
  cooking:    "라운드 산세리프, 따뜻한 톤",
  breakup:    "얇은 세리프 + 여백, 멜랑꼴리",
  sunset:     "세리프 + 따뜻한 톤",
  travel:     "굵은 산세리프 + 여행 폴라로이드 느낌",
};

// ── 피해야 할 요소 (situation 기반) ──
function _avoidList(sit) {
  const block = SITUATION_VISUAL_BLOCK[sit];
  if (!block || !block.size) {
    return ["과도한 텍스트", "낚시성 자극 이미지", "왜곡된 인물"];
  }
  const arr = [...block].slice(0, 6);
  return ["과도한 텍스트 오버레이", ...arr];
}

// ── Unsplash/Pexels 검색 키워드 ──
function _photoKeywords(genre, mood, sit) {
  const d = loadDict();
  const sitData = (d.situations || {})[resolveSituation(sit)] || {};
  const moodData = (d.moods || {})[mood] || {};
  const genreData = (d.genres || {})[resolveGenre(genre)] || {};
  const sitVis = sitData.visual_keywords || [];
  const moodVis = moodData.visual_concepts || [];
  const genreVis = genreData.visual_keywords || [];
  const sitVisuals = getSituationVisuals(resolveSituation(sit));

  const all = [
    ...(sitVis.slice(0, 3)),
    ...(moodVis.slice(0, 2)),
    ...(genreVis.slice(0, 2)),
    ...(sitVisuals.slice(0, 2)),
  ];
  const seen = new Set();
  const out = [];
  for (const v of all) {
    const k = (v || "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= 6) break;
  }
  return out;
}

// ── 컬러톤 ──
function _getColorTones(genre, mood, situation) {
  const d = loadDict();
  const gKey = resolveGenre(genre);
  const sKey = resolveSituation(situation);
  let tones = [];
  for (const [, scene] of Object.entries((d.visuals || {}).visual_scenes || {})) {
    if ((scene.best_for_situations || []).includes(sKey) && (scene.best_for_moods || []).includes(mood)) {
      tones.push(...(scene.color_palette || []));
      break;
    }
  }
  if (!tones.length) {
    tones.push(...((d.genres || {})[gKey] || {}).color_tones || []);
    tones.push(...((d.moods || {})[mood] || {}).color_tones || []);
    tones.push(...((d.situations || {})[sKey] || {}).color_tones || []);
  }
  if (!tones.length) tones = ["dark blue", "warm orange", "soft gray"];
  return [...new Set(tones)].slice(0, 4);
}

// ── 비주얼 컨셉 ──
function _getVisuals(mood, situation) {
  const sitVis = getSituationVisuals(resolveSituation(situation));
  const d = loadDict();
  const moodVis = ((d.moods || {})[mood] || {}).visual_concepts || [];
  const compat = filterVisualsForSituation(resolveSituation(situation), moodVis);
  const combined = [...sitVis];
  for (const v of compat) if (!combined.includes(v)) combined.push(v);
  return combined.slice(0, 6);
}

// ── 인물 여부 ──
function _shouldHavePerson(mood, sit) {
  const s = resolveSituation(sit);
  if (["workout", "party", "commute", "walk"].includes(s)) return true;
  if (["study", "sleep", "reading", "rain"].includes(s)) return false;
  return ["sexy", "romantic", "emotional", "happy", "energetic", "intense"].includes(mood);
}

// ── 레이아웃 (deterministic) ──
function _getLayout(sit, rng) {
  const d = loadDict();
  const layouts = d.thumbnail_layouts || ["center portrait + bold serif title"];
  const pref = {
    workout: "full bleed background + overlay text bottom",
    party: "collage grid 2x2 with overlay title",
    study: "minimal center text on blurred background",
    sleep: "minimal center text on blurred background",
    cafe: "left portrait / right text",
  };
  const sKey = resolveSituation(sit);
  if (pref[sKey] && layouts.includes(pref[sKey])) return pref[sKey];
  return pickOne(rng, layouts);
}

// ── 텍스트 오버레이 (deterministic) ──
const OV_KO = ["{m} {g}", "{s} 감성", "{m} Playlist", "{g} Mix", "{s} Mood", "{m} Vibes"];
const OV_EN = ["{m} {g}", "{s} Vibes", "{m} Playlist", "{g} Mix", "{s} Mood", "Feel the {m}"];

function _overlay(genre, mood, sit, lang, rng) {
  const d = loadDict();
  const gk = (d.genres || {})[resolveGenre(genre)] || {};
  const mk = (d.moods || {})[mood] || {};
  const sk = (d.situations || {})[resolveSituation(sit)] || {};
  const [g, m, s] = lang === "ko"
    ? [(gk.ko_keywords || [genre])[0], (mk.ko_keywords || [mood])[0], (sk.ko_keywords || [sit])[0]]
    : [(gk.en_keywords || [genre])[0], (mk.en_keywords || [mood])[0], (sk.en_keywords || [sit])[0]];
  const tmpls = lang === "ko" ? OV_KO : OV_EN;
  const t = pickOne(rng, tmpls);
  return t.replace(/\{g\}/g, g).replace(/\{m\}/g, m).replace(/\{s\}/g, s);
}

/**
 * Build a thumbnail concept deterministically.
 *
 * @param {object} analysis
 * @param {string} language
 * @param {number} seed uint32 — same seed produces the same result
 * @returns {object} ThumbnailSuggestion
 */
function generateThumbnail(analysis, language, seed) {
  const rng = makeRng((seed >>> 0) || 1);
  const genre = analysis.primaryGenre;
  const sit = analysis.primarySituation;
  const mood = pickCompatibleMood(resolveSituation(sit), analysis.detectedMoods);
  const d = loadDict();
  const gKey = resolveGenre(genre);
  const sKey = resolveSituation(sit);
  const sitEn = ((d.situations || {})[sKey] || {}).en_keywords || [sKey];
  const moodEn = ((d.moods || {})[mood] || {}).en_keywords || [mood];
  const genreEn = ((d.genres || {})[gKey] || {}).en_keywords || [gKey];

  const concepts = _getVisuals(mood, sit);
  const tones = _getColorTones(genre, mood, sit);
  const photoKw = _photoKeywords(genre, mood, sit);

  const mainKw = [sitEn[0], moodEn[0], genreEn[0], concepts[0] || ""].filter(Boolean).slice(0, 5);
  const subKw = [...concepts.slice(1, 4), ...tones.slice(0, 2)].slice(0, 5);

  return {
    mainKeywords: mainKw,
    subKeywords: subKw,
    colorTone: tones,
    backgroundConcept: concepts[0] || "abstract gradient",
    composition: concepts[1] || (concepts[0] ? `centered ${concepts[0]}` : "rule of thirds composition"),
    hasPerson: _shouldHavePerson(mood, sit),
    layout: _getLayout(sit, rng),
    textOverlay: _overlay(genre, mood, sit, language, rng),
    fontFeel: FONT_FEEL[sKey] || "산세리프 + 미디엄 웨이트, 균형감",
    avoidList: _avoidList(sKey),
    photoSearchKeywords: photoKw,
  };
}

module.exports = { generateThumbnail };
