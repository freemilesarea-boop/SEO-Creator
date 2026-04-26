/**
 * Exporter — 결과(GenerationResponse)를 JSON / CSV / TXT 문자열로 변환.
 *
 * 파일 쓰기는 호출자(Electron main, IPC 등)가 담당.
 * exporter는 순수 변환 함수만 노출한다.
 */

"use strict";

// ── helpers ──

function _csvEscape(val) {
  if (val == null) return "";
  const s = String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function _join(arr, sep = ", ") {
  if (!Array.isArray(arr)) return "";
  return arr.filter(Boolean).join(sep);
}

function _safe(obj, key, fallback = "") {
  return obj && obj[key] != null ? obj[key] : fallback;
}

function _stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ── JSON ──

/**
 * @param {object} response GenerationResponse
 * @returns {string} pretty JSON
 */
function toJSON(response) {
  return JSON.stringify(response || {}, null, 2);
}

// ── CSV ──

const CSV_COLUMNS = [
  "generation_id",
  "set_label",
  "set_key",
  "intent",
  "yt_music_title",
  "yt_playlist_title",
  "seo_score",
  "primary_genre",
  "primary_mood",
  "primary_situation",
  "language",
  "thumbnail_layout",
  "thumbnail_overlay",
  "thumbnail_colors",
  "thumbnail_avoid",
  "tags",
  "hashtags",
  "created_at",
];

/**
 * @param {object} response
 * @param {{ withHeader?: boolean }} [opts]
 * @returns {string}
 */
function toCSV(response, opts) {
  const withHeader = !opts || opts.withHeader !== false;
  const lines = [];
  if (withHeader) lines.push(CSV_COLUMNS.join(","));

  const r = response || {};
  const a = r.analysis || {};
  const results = Array.isArray(r.results) ? r.results : [];

  for (const set of results) {
    const t = set.thumbnail || {};
    const dp = set.descriptionPack || {};
    const row = [
      _csvEscape(_safe(r, "generationId")),
      _csvEscape(_safe(set, "setLabel")),
      _csvEscape(_safe(set, "setKey")),
      _csvEscape(_safe(set, "intent")),
      _csvEscape(_safe(set, "ytMusicTitle")),
      _csvEscape(_safe(set, "ytPlaylistTitle")),
      _csvEscape(_safe(set, "seoScore", 0)),
      _csvEscape(_safe(a, "primaryGenre")),
      _csvEscape(_safe(a, "primaryMood")),
      _csvEscape(_safe(a, "primarySituation")),
      _csvEscape(_safe(a, "language")),
      _csvEscape(_safe(t, "layout")),
      _csvEscape(_safe(t, "textOverlay")),
      _csvEscape(_join(t.colorTone, " | ")),
      _csvEscape(_join(t.avoidList, " | ")),
      _csvEscape(_join(dp.tags, " | ")),
      _csvEscape(_join(dp.hashtags, " ")),
      _csvEscape(_safe(r, "createdAt")),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\r\n") + "\r\n";
}

// ── TXT ──

/**
 * @param {object} response
 * @returns {string}
 */
function toTXT(response) {
  const r = response || {};
  const a = r.analysis || {};
  const results = Array.isArray(r.results) ? r.results : [];

  const lines = [];
  lines.push("=========================================");
  lines.push("  SEO Creator — Generated Result");
  lines.push("=========================================");
  lines.push(`Generation ID : ${_safe(r, "generationId")}`);
  lines.push(`Created At    : ${_safe(r, "createdAt")}`);
  lines.push("");
  lines.push("[Analysis]");
  lines.push(`  Genre     : ${_safe(a, "primaryGenre")}`);
  lines.push(`  Mood      : ${_safe(a, "primaryMood")}`);
  lines.push(`  Situation : ${_safe(a, "primarySituation")}`);
  lines.push(`  Language  : ${_safe(a, "language")}`);
  if (Array.isArray(a.topArtists) && a.topArtists.length) {
    lines.push(`  Artists   : ${_join(a.topArtists)}`);
  }
  lines.push("");

  results.forEach((set, idx) => {
    const t = set.thumbnail || {};
    const dp = set.descriptionPack || {};
    lines.push(`---------- Set ${idx + 1}: ${_safe(set, "setLabel")} (${_safe(set, "setKey")}) ----------`);
    lines.push(`SEO Score      : ${_safe(set, "seoScore", 0)}`);
    lines.push(`Intent         : ${_safe(set, "intent")}`);
    lines.push("");
    lines.push("YT Music 제목  :");
    lines.push(`  ${_safe(set, "ytMusicTitle")}`);
    lines.push("");
    lines.push("YT Playlist 제목:");
    lines.push(`  ${_safe(set, "ytPlaylistTitle")}`);
    lines.push("");
    lines.push("[Thumbnail]");
    lines.push(`  Background : ${_safe(t, "backgroundConcept")}`);
    lines.push(`  Layout     : ${_safe(t, "layout")}`);
    lines.push(`  Overlay    : ${_safe(t, "textOverlay")}`);
    lines.push(`  Colors     : ${_join(t.colorTone)}`);
    lines.push(`  Font feel  : ${_safe(t, "fontFeel")}`);
    if (Array.isArray(t.avoidList) && t.avoidList.length) {
      lines.push(`  Avoid      : ${_join(t.avoidList)}`);
    }
    if (Array.isArray(t.photoSearchKeywords) && t.photoSearchKeywords.length) {
      lines.push(`  Photo kw   : ${_join(t.photoSearchKeywords)}`);
    }
    lines.push("");
    if (dp && (dp.description || dp.tags || dp.hashtags)) {
      lines.push("[Description]");
      if (dp.description) {
        lines.push(dp.description.split("\n").map((l) => `  ${l}`).join("\n"));
      }
      if (Array.isArray(dp.tags) && dp.tags.length) {
        lines.push("");
        lines.push(`Tags     : ${_join(dp.tags)}`);
      }
      if (Array.isArray(dp.hashtags) && dp.hashtags.length) {
        lines.push(`Hashtags : ${_join(dp.hashtags, " ")}`);
      }
    }
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * 추천 파일명. 호출자가 그대로 사용해도 OK.
 * @param {object} response
 * @param {"json"|"csv"|"txt"} ext
 */
function suggestFilename(response, ext) {
  const id = (response && response.generationId) || "result";
  return `seo-creator-${id}-${_stamp()}.${ext}`;
}

module.exports = { toJSON, toCSV, toTXT, suggestFilename, CSV_COLUMNS };
