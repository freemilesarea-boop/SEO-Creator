/**
 * Thumbnail Generator (Node.js, situation-first)
 */
const path = require("path");
const fs = require("fs");
const { pickCompatibleMood, filterVisualsForSituation, getSituationVisuals } = require("./coherence");

let _dict = null;
function loadDict() {
  if (!_dict) _dict = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "backend", "app", "data", "keyword_dictionary.json"), "utf-8"));
  return _dict;
}

function _getColorTones(genre, mood, situation) {
  const d = loadDict();
  let tones = [];
  for (const [, scene] of Object.entries((d.visuals || {}).visual_scenes || {})) {
    if ((scene.best_for_situations || []).includes(situation) && (scene.best_for_moods || []).includes(mood)) {
      tones.push(...(scene.color_palette || [])); break;
    }
  }
  if (!tones.length) {
    tones.push(...((d.genres || {})[genre] || {}).color_tones || []);
    tones.push(...((d.moods || {})[mood] || {}).color_tones || []);
  }
  if (!tones.length) tones = ["dark blue", "warm orange", "soft gray"];
  return [...new Set(tones)].slice(0, 4);
}

function _getVisuals(mood, situation) {
  const sitVis = getSituationVisuals(situation);
  const d = loadDict();
  const moodVis = ((d.moods || {})[mood] || {}).visual_concepts || [];
  const compat = filterVisualsForSituation(situation, moodVis);
  const combined = [...sitVis];
  for (const v of compat) if (!combined.includes(v)) combined.push(v);
  return combined.slice(0, 6);
}

function _shouldHavePerson(mood, sit) {
  if (["workout","party","commute","walk"].includes(sit)) return true;
  if (["study","sleep","reading","rain"].includes(sit)) return false;
  return ["sexy","romantic","emotional","happy","energetic","intense"].includes(mood);
}

function _getLayout(sit) {
  const d = loadDict();
  const layouts = d.thumbnail_layouts || ["center portrait + bold serif title"];
  const pref = { workout: "full bleed background + overlay text bottom", party: "collage grid 2x2 with overlay title", study: "minimal center text on blurred background", sleep: "minimal center text on blurred background", cafe: "left portrait / right text" };
  if (pref[sit] && layouts.includes(pref[sit])) return pref[sit];
  return layouts[Math.floor(Math.random() * layouts.length)];
}

const OV_KO = ["{m} {g}","{s} 감성","{m} Playlist","{g} Mix","{s} Mood","{m} Vibes"];
const OV_EN = ["{m} {g}","{s} Vibes","{m} Playlist","{g} Mix","{s} Mood","Feel the {m}"];

function _overlay(genre, mood, sit, lang) {
  const d = loadDict();
  const gk = (d.genres || {})[genre] || {};
  const mk = (d.moods || {})[mood] || {};
  const sk = (d.situations || {})[sit] || {};
  const [g, m, s] = lang === "ko"
    ? [(gk.ko_keywords || [genre])[0], (mk.ko_keywords || [mood])[0], (sk.ko_keywords || [sit])[0]]
    : [(gk.en_keywords || [genre])[0], (mk.en_keywords || [mood])[0], (sk.en_keywords || [sit])[0]];
  const tmpls = lang === "ko" ? OV_KO : OV_EN;
  const t = tmpls[Math.floor(Math.random() * tmpls.length)];
  return t.replace(/\{g\}/g, g).replace(/\{m\}/g, m).replace(/\{s\}/g, s);
}

function generateThumbnail(analysis, language) {
  const genre = analysis.primaryGenre;
  const sit = analysis.primarySituation;
  const mood = pickCompatibleMood(sit, analysis.detectedMoods);
  const d = loadDict();
  const sitEn = ((d.situations || {})[sit] || {}).en_keywords || [sit];
  const moodEn = ((d.moods || {})[mood] || {}).en_keywords || [mood];
  const genreEn = ((d.genres || {})[genre] || {}).en_keywords || [genre];
  const concepts = _getVisuals(mood, sit);
  const mainKw = [sitEn[0], moodEn[0], genreEn[0], concepts[0] || ""].filter(Boolean).slice(0, 5);
  const tones = _getColorTones(genre, mood, sit);
  const subKw = [...concepts.slice(1, 4), ...tones.slice(0, 2)].slice(0, 5);
  return {
    mainKeywords: mainKw,
    subKeywords: subKw,
    colorTone: tones,
    backgroundConcept: concepts[0] || "abstract gradient",
    hasPerson: _shouldHavePerson(mood, sit),
    layout: _getLayout(sit),
    textOverlay: _overlay(genre, mood, sit, language),
  };
}

module.exports = { generateThumbnail };
