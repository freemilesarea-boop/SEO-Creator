/**
 * Metadata Analyzer Module
 *
 * Analyzes track metadata (artist names, track titles) from a playlist
 * to detect genre, mood, situation, and language.
 *
 * Ported from backend/app/services/metadata_analyzer.py
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Valid enum values (mirrors backend/app/models/schemas.py)
// ---------------------------------------------------------------------------

const VALID_GENRES = new Set([
  "kpop", "pop", "rnb", "hiphop", "lofi", "jazz", "rock", "edm",
  "classical", "indie", "ballad", "acoustic", "latin", "jpop", "ost",
]);

const VALID_MOODS = new Set([
  "chill", "emotional", "energetic", "dreamy", "sexy", "happy",
  "sad", "dark", "romantic", "nostalgic", "peaceful", "intense",
]);

const VALID_SITUATIONS = new Set([
  "study", "night_drive", "workout", "cafe", "sleep", "morning",
  "rain", "commute", "party", "cooking", "reading", "walk",
]);

// ---------------------------------------------------------------------------
// Genre-mood correlations
// ---------------------------------------------------------------------------

const GENRE_MOOD_CORRELATION = {
  lofi:      ["chill", "dreamy", "peaceful"],
  ballad:    ["emotional", "sad", "romantic"],
  edm:       ["energetic", "intense", "happy"],
  rnb:       ["sexy", "chill", "romantic"],
  hiphop:    ["energetic", "dark", "intense"],
  jazz:      ["chill", "romantic", "nostalgic"],
  acoustic:  ["peaceful", "romantic", "nostalgic"],
  rock:      ["energetic", "intense", "dark"],
  classical: ["peaceful", "emotional", "dreamy"],
  indie:     ["dreamy", "nostalgic", "chill"],
  kpop:      ["energetic", "happy", "emotional"],
  pop:       ["happy", "energetic", "romantic"],
  latin:     ["energetic", "sexy", "happy"],
  jpop:      ["happy", "energetic", "emotional"],
  ost:       ["emotional", "romantic", "nostalgic"],
};

// ---------------------------------------------------------------------------
// Mood-situation correlations (cooking/morning removed from broad moods)
// ---------------------------------------------------------------------------

const MOOD_SITUATION_CORRELATION = {
  chill:     ["study", "cafe", "reading"],
  emotional: ["rain", "night_drive"],
  energetic: ["workout", "party", "commute"],
  dreamy:    ["night_drive", "reading"],
  sexy:      ["night_drive", "party", "late_night"],
  happy:     ["morning", "walk", "commute"],
  sad:       ["rain", "night_drive"],
  dark:      ["night_drive", "late_night"],
  romantic:  ["cafe", "walk"],
  nostalgic: ["rain", "cafe", "walk"],
  peaceful:  ["morning", "reading", "walk"],
  intense:   ["workout", "party", "commute"],
};

// ---------------------------------------------------------------------------
// Artist situation priors – 아티스트 기반 situation 가중치 (23 artists)
// ---------------------------------------------------------------------------

const ARTIST_SITUATION_PRIOR = {
  "the weeknd":     ["late_night", "night_drive"],
  "dua lipa":       ["party", "workout"],
  "harry styles":   ["walk", "commute"],
  "justin bieber":  ["commute", "walk"],
  "taylor swift":   ["commute", "walk", "rain"],
  "olivia rodrigo": ["night_drive", "rain"],
  "billie eilish":  ["late_night", "night_drive"],
  "ariana grande":  ["party", "workout"],
  "bruno mars":     ["party", "commute"],
  "drake":          ["night_drive", "late_night"],
  "travis scott":   ["night_drive", "party"],
  "lana del rey":   ["night_drive", "late_night", "rain"],
  "frank ocean":    ["late_night", "night_drive"],
  "sza":            ["late_night", "night_drive"],
  "kendrick lamar": ["workout", "commute"],
  "bts":            ["workout", "party", "commute"],
  "blackpink":      ["workout", "party"],
  "iu":             ["cafe", "rain", "walk"],
  "dean":           ["late_night", "night_drive"],
  "crush":          ["late_night", "cafe"],
  "heize":          ["rain", "late_night"],
  "newjeans":       ["commute", "walk"],
  "aespa":          ["workout", "party"],
};

// ---------------------------------------------------------------------------
// High-precision situations – 엄격한 검출 조건
// ---------------------------------------------------------------------------

const HIGH_PRECISION_SITUATIONS = new Set([
  "cooking", "study", "sleep", "cafe", "morning",
]);

// cooking/study/sleep/cafe/morning을 허용하는 mood
const PRECISION_ALLOW_MOODS = {
  cooking: new Set(["chill", "peaceful", "soft"]),
  study:   new Set(["chill", "peaceful", "dreamy", "soft"]),
  sleep:   new Set(["peaceful", "dreamy", "soft", "chill"]),
  cafe:    new Set(["chill", "romantic", "peaceful", "nostalgic", "soft"]),
  morning: new Set(["peaceful", "happy", "soft"]),
};

// cooking/study/sleep/cafe/morning을 허용하는 genre
const PRECISION_ALLOW_GENRES = {
  cooking: new Set(["acoustic", "lofi", "jazz"]),
  study:   new Set(["lofi", "classical", "ambient", "acoustic", "jazz"]),
  sleep:   new Set(["ambient", "classical", "lofi", "acoustic"]),
  cafe:    new Set(["jazz", "acoustic", "indie", "lofi", "ballad"]),
  morning: new Set(["acoustic", "indie", "lofi", "pop"]),
};

// cooking/study/sleep/cafe/morning을 차단하는 mood
const PRECISION_BLOCK_MOODS = {
  cooking: new Set(["energetic", "dark", "intense", "sexy"]),
  study:   new Set(["energetic", "intense", "sexy"]),
  sleep:   new Set(["energetic", "intense", "sexy", "happy"]),
  cafe:    new Set(["intense", "dark"]),
  morning: new Set(["dark", "intense", "sexy"]),
};

// ---------------------------------------------------------------------------
// Situation conflict penalties
// ---------------------------------------------------------------------------

const SITUATION_CONFLICTS = {
  night_drive: ["cooking", "morning", "study"],
  party:       ["sleep", "study", "reading", "cooking"],
  workout:     ["sleep", "cooking", "reading", "cafe"],
  late_night:  ["morning", "cooking"],
};

const MOOD_SUPPRESSES_SITUATION = {
  dark:      ["cooking", "morning"],
  intense:   ["cooking", "sleep", "morning", "cafe"],
  energetic: ["sleep", "cooking"],
  sexy:      ["cooking", "morning", "study"],
};

// ---------------------------------------------------------------------------
// Load keyword dictionary (cached)
// ---------------------------------------------------------------------------

const DICTIONARY_PATH = path.resolve(__dirname, "data", "keyword_dictionary.json");

let _dictionary = null;

function _loadDictionary() {
  if (_dictionary === null) {
    try {
      const raw = fs.readFileSync(DICTIONARY_PATH, "utf-8");
      _dictionary = JSON.parse(raw);
    } catch (_err) {
      _dictionary = {};
    }
  }
  return _dictionary;
}

function _getArtistGenreMap() {
  return _loadDictionary().artist_genre_map || {};
}

function _getGenreKeywords() {
  const d = _loadDictionary();
  if (d.genre_keywords) return d.genre_keywords;

  const result = {};
  const genres = d.genres || {};
  for (const [genre, data] of Object.entries(genres)) {
    const kws = (data.ko_keywords || []).concat(data.en_keywords || []);
    if (kws.length) result[genre] = kws;
  }
  return result;
}

function _getMoodKeywords() {
  const d = _loadDictionary();
  if (d.mood_keywords) return d.mood_keywords;

  const result = {};
  const moods = d.moods || {};
  for (const [mood, data] of Object.entries(moods)) {
    const kws = (data.ko_keywords || []).concat(data.en_keywords || []);
    if (kws.length) result[mood] = kws;
  }
  return result;
}

function _getSituationKeywords() {
  const d = _loadDictionary();
  if (d.situation_keywords) return d.situation_keywords;

  const result = {};
  const situations = d.situations || {};
  for (const [sit, data] of Object.entries(situations)) {
    const kws = (data.ko_keywords || []).concat(data.en_keywords || []);
    if (kws.length) result[sit] = kws;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hangul / Latin detection helpers
// ---------------------------------------------------------------------------

function _containsHangul(text) {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    // Hangul Syllables: AC00–D7A3
    // Hangul Compatibility Jamo: 3131–3163
    // Hangul Jamo: 1100–11FF
    if (
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x3131 && code <= 0x3163) ||
      (code >= 0x1100 && code <= 0x11ff)
    ) {
      return true;
    }
  }
  return false;
}

function _containsLatin(text) {
  for (const ch of text) {
    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z")) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Set intersection helper
// ---------------------------------------------------------------------------

function _setsIntersect(setA, setB) {
  for (const item of setA) {
    if (setB.has(item)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Counter helper (mimics Python's collections.Counter)
// ---------------------------------------------------------------------------

class Counter {
  constructor() {
    this._counts = new Map();
  }

  add(key, amount = 1) {
    this._counts.set(key, (this._counts.get(key) || 0) + amount);
  }

  get(key) {
    return this._counts.get(key) || 0;
  }

  has(key) {
    return this._counts.has(key);
  }

  delete(key) {
    this._counts.delete(key);
  }

  set(key, value) {
    if (value <= 0) {
      this._counts.delete(key);
    } else {
      this._counts.set(key, value);
    }
  }

  /** Return keys sorted by count descending, optionally capped. */
  mostCommon(n) {
    const entries = [...this._counts.entries()].sort((a, b) => b[1] - a[1]);
    const capped = n != null ? entries.slice(0, n) : entries;
    return capped; // array of [key, count]
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect language from a list of text strings.
 * @param {string[]} texts
 * @returns {"ko"|"en"|"mixed"}
 */
function detectLanguage(texts) {
  let hasHangul = false;
  let hasLatin = false;
  for (const text of texts) {
    if (_containsHangul(text)) hasHangul = true;
    if (_containsLatin(text)) hasLatin = true;
    if (hasHangul && hasLatin) return "mixed";
  }
  if (hasHangul) return "ko";
  return "en";
}

/**
 * Detect genres from artist names and track titles.
 * @param {string[]} artists
 * @param {string[]} titles
 * @returns {string[]} genres sorted by frequency (descending)
 */
function detectGenres(artists, titles) {
  const genreCounter = new Counter();

  // Build a lower-cased artist-genre lookup
  const artistGenreMap = _getArtistGenreMap();
  const artistLowerMap = {};
  for (const [key, val] of Object.entries(artistGenreMap)) {
    artistLowerMap[key.toLowerCase()] = val;
  }

  for (const artist of artists) {
    const key = artist.trim().toLowerCase();
    if (key in artistLowerMap) {
      const val = artistLowerMap[key];
      const genresForArtist = Array.isArray(val) ? val : [val];
      for (const genre of genresForArtist) {
        genreCounter.add(genre);
      }
    }
  }

  // Title keyword scanning
  const combinedText = titles.map((t) => t.toLowerCase()).join(" ");
  const genreKeywords = _getGenreKeywords();
  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    for (const kw of keywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        genreCounter.add(genre);
      }
    }
  }

  // Filter to valid genres, sorted by frequency
  const detected = genreCounter
    .mostCommon()
    .filter(([genre]) => VALID_GENRES.has(genre))
    .map(([genre]) => genre);

  return detected;
}

/**
 * Detect moods from track titles and detected genres.
 * @param {string[]} titles
 * @param {string[]} genres
 * @returns {string[]} moods sorted by frequency (descending)
 */
function detectMoods(titles, genres) {
  const moodCounter = new Counter();

  // Title keyword scanning
  const combinedText = titles.map((t) => t.toLowerCase()).join(" ");
  const moodKeywords = _getMoodKeywords();
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    for (const kw of keywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        moodCounter.add(mood);
      }
    }
  }

  // Genre-mood correlation
  for (const genre of genres) {
    const correlatedMoods = GENRE_MOOD_CORRELATION[genre] || [];
    for (const m of correlatedMoods) {
      moodCounter.add(m);
    }
  }

  // Filter to valid moods, sorted by frequency
  const detected = moodCounter
    .mostCommon()
    .filter(([mood]) => VALID_MOODS.has(mood))
    .map(([mood]) => mood);

  return detected;
}

/**
 * Detect situations with precision filtering and conflict penalties.
 *
 * - High-precision mode for daily-life tags (cooking, study, sleep, etc.)
 * - Artist-based situation priors
 * - Conflict penalties between contradictory situations
 * - Output capped at top 3
 *
 * @param {string[]} titles
 * @param {string[]} moods
 * @param {string[]} [genres=[]]
 * @param {string[]} [artists=[]]
 * @returns {string[]} top 3 situations
 */
function detectSituations(titles, moods, genres, artists) {
  genres = genres || [];
  artists = artists || [];
  const situationCounter = new Counter();

  // --- 1. Title keyword scanning ---
  const combinedText = titles.map((t) => t.toLowerCase()).join(" ");
  const situationKeywords = _getSituationKeywords();
  for (const [situation, keywords] of Object.entries(situationKeywords)) {
    for (const kw of keywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        situationCounter.add(situation);
      }
    }
  }

  // --- 2. Mood-situation correlation ---
  for (const mood of moods) {
    const correlatedSituations = MOOD_SITUATION_CORRELATION[mood] || [];
    for (const s of correlatedSituations) {
      situationCounter.add(s);
    }
  }

  // --- 3. Artist situation priors (weight=2 each) ---
  for (const artist of artists) {
    const key = artist.trim().toLowerCase();
    const priors = ARTIST_SITUATION_PRIOR[key] || [];
    for (const s of priors) {
      situationCounter.add(s, 2);
    }
  }

  // --- 4. High-precision gate for daily-life situations ---
  const moodSet = new Set(moods);
  const genreSet = new Set(genres);
  const toRemove = [];

  for (const sit of HIGH_PRECISION_SITUATIONS) {
    if (!situationCounter.has(sit)) continue;

    const allowMoods = PRECISION_ALLOW_MOODS[sit] || new Set();
    const allowGenres = PRECISION_ALLOW_GENRES[sit] || new Set();
    const blockMoods = PRECISION_BLOCK_MOODS[sit] || new Set();

    const hasAllowMood = _setsIntersect(moodSet, allowMoods);
    const hasAllowGenre = _setsIntersect(genreSet, allowGenres);
    const hasBlockMood = _setsIntersect(moodSet, blockMoods);

    // Block if blocking moods present
    if (hasBlockMood) {
      toRemove.push(sit);
      continue;
    }

    // Need at least one allowing mood AND one allowing genre
    if (!(hasAllowMood && hasAllowGenre)) {
      toRemove.push(sit);
      continue;
    }
  }

  for (const sit of toRemove) {
    situationCounter.delete(sit);
  }

  // --- 5. Conflict penalties ---
  for (const [strongSit, weakSits] of Object.entries(SITUATION_CONFLICTS)) {
    if (situationCounter.has(strongSit) && situationCounter.get(strongSit) >= 2) {
      for (const weak of weakSits) {
        if (situationCounter.has(weak)) {
          const newVal = Math.max(0, situationCounter.get(weak) - 3);
          if (newVal <= 0) {
            situationCounter.delete(weak);
          } else {
            situationCounter.set(weak, newVal);
          }
        }
      }
    }
  }

  // Mood-based suppression (top 3 moods only)
  for (const mood of moods.slice(0, 3)) {
    const suppressed = MOOD_SUPPRESSES_SITUATION[mood] || [];
    for (const sit of suppressed) {
      if (situationCounter.has(sit)) {
        const newVal = Math.max(0, situationCounter.get(sit) - 2);
        if (newVal <= 0) {
          situationCounter.delete(sit);
        } else {
          situationCounter.set(sit, newVal);
        }
      }
    }
  }

  // --- 6. Validate and cap at top 3 ---
  const detected = situationCounter
    .mostCommon(3)
    .filter(([situation, cnt]) => VALID_SITUATIONS.has(situation) && cnt > 0)
    .map(([situation]) => situation);

  // Ensure at least 1 result
  if (detected.length === 0) {
    if (genres.length && genres[0] === "pop") {
      return ["commute"];
    }
    return ["study"];
  }

  return detected;
}

/**
 * Build a de-duplicated keyword pool from analysis results.
 * @param {string[]} genres
 * @param {string[]} moods
 * @param {string[]} situations
 * @param {string[]} artists
 * @param {string} language
 * @returns {string[]}
 */
function buildKeywordPool(genres, moods, situations, artists, language) {
  const pool = [];
  const seen = new Set();

  for (const item of [...genres, ...moods, ...situations]) {
    if (!seen.has(item)) {
      pool.push(item);
      seen.add(item);
    }
  }

  for (const artist of artists.slice(0, 5)) {
    const normalized = artist.trim();
    if (normalized && !seen.has(normalized)) {
      pool.push(normalized);
      seen.add(normalized);
    }
  }

  if (language && !seen.has(language)) {
    pool.push(language);
    seen.add(language);
  }

  return pool;
}

/**
 * Main analysis entry point.
 *
 * @param {{ playlistTitle: string, trackCount: number, tracks: Array<{title: string, artist: string, durationSeconds: number}> }} playlist
 * @returns {{
 *   detectedGenres: string[],
 *   detectedMoods: string[],
 *   detectedSituations: string[],
 *   primaryGenre: string,
 *   primaryMood: string,
 *   primarySituation: string,
 *   language: string,
 *   topArtists: string[],
 *   keywordPool: string[]
 * }}
 */
function analyzePlaylist(playlist) {
  const artists = (playlist.tracks || []).map((t) => t.artist);
  const titles = (playlist.tracks || []).map((t) => t.title);

  // Top artists by frequency (max 5)
  const artistFreq = {};
  for (const a of artists) {
    const trimmed = a.trim();
    if (trimmed) {
      artistFreq[trimmed] = (artistFreq[trimmed] || 0) + 1;
    }
  }
  const topArtists = Object.entries(artistFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const allTexts = titles.concat(artists);
  const language = detectLanguage(allTexts);

  const genres = detectGenres(artists, titles);
  const moods = detectMoods(titles, genres);
  const situations = detectSituations(titles, moods, genres, artists);

  const primaryGenre = genres.length ? genres[0] : "pop";
  const primaryMood = moods.length ? moods[0] : "chill";
  const primarySituation = situations.length ? situations[0] : "study";

  const keywordPool = buildKeywordPool(genres, moods, situations, topArtists, language);

  return {
    detectedGenres: genres,
    detectedMoods: moods,
    detectedSituations: situations,
    primaryGenre,
    primaryMood,
    primarySituation,
    language,
    topArtists,
    keywordPool,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  analyzePlaylist,
  detectLanguage,
  detectGenres,
  detectMoods,
  detectSituations,
  buildKeywordPool,
};
