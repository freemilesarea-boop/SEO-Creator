/**
 * SEO Creator Engine (Node.js)
 *
 * Electron main process에서 직접 호출하는 얇은 파사드.
 * 실제 로직은 engine/ 하위 helper 모듈에 위치한다.
 *
 * Step 4a 범위 — core generate 재배선:
 *   - history-store 연결 (atomic write + corruption recovery)
 *   - hashSeed(input) 기반 deterministic seed
 *   - title/thumbnail generator에 seed 전달
 *   - descriptionPack 통합
 *   - per-set scoring (scoring.js)
 *   - generateFromManual / generateFromLink 시그니처 유지
 *
 * regenerate / favorites / export / history list-detail은 Step 4b에서 추가.
 */

"use strict";

const crypto = require("crypto");

const { analyzePlaylist } = require("./metadata-analyzer");
const { pickCompatibleMood, filterCompatibleMoods } = require("./coherence");
const {
  collectKeywords,
  generateCombinationKeywords,
  generateLongtailKeywords,
  scoreAllKeywords,
} = require("./keyword-engine");
const { generateTitleSets } = require("./title-generator");
const { generateThumbnail } = require("./thumbnail-generator");
const { buildDescriptionPack } = require("./description-generator");
const { explainResultSet } = require("./explainer");
const { parsePlaylist } = require("./playlist-parser");
const { perSetScore, titleDiversity } = require("./scoring");
const { hashSeed } = require("./util/seeded-random");
const historyStore = require("./history-store");
const favoritesStore = require("./favorites-store");
const regenerate = require("./regenerate");
const exporter = require("./exporter");

// ── lifecycle ──

function initHistory(userDataPath) {
  historyStore.init(userDataPath);
}

// ── core build ──

function _buildResponse(analysis, language, opts) {
  // situation-first mood 보정
  const compatMood = pickCompatibleMood(analysis.primarySituation, analysis.detectedMoods);
  analysis.primaryMood = compatMood;
  analysis.detectedMoods = filterCompatibleMoods(
    analysis.primarySituation,
    analysis.detectedMoods,
    3
  );

  // 키워드 수집 + 점수화
  let allKw = [
    ...collectKeywords(analysis),
    ...generateCombinationKeywords(analysis),
    ...generateLongtailKeywords(analysis),
  ];
  allKw = [...new Set(allKw)];
  const keywordScores = scoreAllKeywords(allKw, analysis);

  // deterministic seed: opts.seedKey 우선, 없으면 분석 fingerprint 사용
  const seedKey =
    (opts && opts.seedKey) ||
    JSON.stringify({
      g: analysis.primaryGenre,
      m: analysis.primaryMood,
      s: analysis.primarySituation,
      lg: language,
      kp: analysis.keywordPool,
      ta: analysis.topArtists,
    });
  const seed = hashSeed(seedKey);

  // 제목 3세트 — seed 전달 (P6 결정성)
  const titleSets = generateTitleSets(analysis, keywordScores, language, seed);

  // 각 세트에 thumbnail + descriptionPack + explanation 결합
  const results = titleSets.map((ts) => {
    const thumbSeed = hashSeed(`${seed}-${ts.setKey}-thumb`);
    const thumbnail = generateThumbnail(analysis, language, thumbSeed);
    const descriptionPack = buildDescriptionPack(analysis, ts, language);
    const explanation = explainResultSet(ts.ytMusicTitle, ts.ytPlaylistTitle, ts.setLabel);
    return {
      setKey: ts.setKey,
      setLabel: ts.setLabel,
      intent: ts.intent,
      ytMusicTitle: ts.ytMusicTitle,
      ytPlaylistTitle: ts.ytPlaylistTitle,
      usedKeywords: ts.usedKeywords,
      thumbnail,
      descriptionPack,
      explanation,
    };
  });

  // per-set scoring (diversity 포함)
  const div = titleDiversity(results);
  for (const set of results) {
    const sc = perSetScore(set, analysis, keywordScores, {
      diversityBonus: (div.perSet && div.perSet[set.setKey]) || 0,
    });
    set.seoScore = sc.total;
    set.breakdown = sc.breakdown;
  }

  return {
    generationId: crypto.randomUUID().substring(0, 8),
    createdAt: new Date().toISOString(),
    language,
    analysis,
    keywordScores: keywordScores.slice(0, 15),
    results,
    trendEnhanced: false,
    trendsSource: "off",
    trendKeywords: [],
    trendCacheHit: false,
  };
}

// ── 공개 API: generate ──

function generateFromManual(input) {
  const {
    genre,
    mood,
    situation,
    language = "ko",
    emotion = "",
    referenceArtists = [],
    excludeKeywords = [],
  } = input || {};

  if (!genre || !mood || !situation) {
    throw new Error("genre/mood/situation are required");
  }

  const keywordPool = [genre, mood, situation];
  if (emotion) keywordPool.push(emotion);
  keywordPool.push(...referenceArtists);

  const analysis = {
    detectedGenres: [genre],
    detectedMoods: [mood],
    detectedSituations: [situation],
    primaryGenre: genre,
    primaryMood: mood,
    primarySituation: situation,
    language,
    topArtists: (referenceArtists || []).slice(0, 5),
    keywordPool,
  };

  if (excludeKeywords && excludeKeywords.length) {
    const excl = new Set(excludeKeywords.map((k) => String(k).toLowerCase()));
    analysis.keywordPool = analysis.keywordPool.filter(
      (k) => !excl.has(String(k).toLowerCase())
    );
  }

  const seedKey = JSON.stringify({
    kind: "manual",
    genre,
    mood,
    situation,
    language,
    emotion,
    referenceArtists,
    excludeKeywords,
  });
  const response = _buildResponse(analysis, language, { seedKey });

  historyStore.save({
    ...response,
    id: response.generationId,
    inputType: "manual",
    seoScore: (response.results[0] && response.results[0].seoScore) || 0,
  });
  return response;
}

async function generateFromLink(input) {
  const {
    url,
    language = "ko",
    overrideGenre,
    overrideMood,
    overrideSituation,
    excludeKeywords = [],
  } = input || {};

  if (!url) throw new Error("url is required");

  const playlist = await parsePlaylist(url);
  if (!playlist || !playlist.tracks || !playlist.tracks.length) {
    throw new Error("재생목록에 곡이 없습니다.");
  }

  const analysis = analyzePlaylist(playlist);

  if (overrideGenre) {
    analysis.primaryGenre = overrideGenre;
    if (!analysis.detectedGenres.includes(overrideGenre)) {
      analysis.detectedGenres.unshift(overrideGenre);
    }
  }
  if (overrideMood) {
    analysis.primaryMood = overrideMood;
    if (!analysis.detectedMoods.includes(overrideMood)) {
      analysis.detectedMoods.unshift(overrideMood);
    }
  }
  if (overrideSituation) {
    analysis.primarySituation = overrideSituation;
    if (!analysis.detectedSituations.includes(overrideSituation)) {
      analysis.detectedSituations.unshift(overrideSituation);
    }
  }

  if (excludeKeywords && excludeKeywords.length) {
    const excl = new Set(excludeKeywords.map((k) => String(k).toLowerCase()));
    analysis.keywordPool = analysis.keywordPool.filter(
      (k) => !excl.has(String(k).toLowerCase())
    );
  }

  const seedKey = JSON.stringify({
    kind: "link",
    url,
    language,
    overrideGenre,
    overrideMood,
    overrideSituation,
    excludeKeywords,
    fingerprint: {
      g: analysis.primaryGenre,
      m: analysis.primaryMood,
      s: analysis.primarySituation,
    },
  });
  const response = _buildResponse(analysis, language, { seedKey });

  historyStore.save({
    ...response,
    id: response.generationId,
    inputType: "link",
    seoScore: (response.results[0] && response.results[0].seoScore) || 0,
  });
  return response;
}

// ── stores lifecycle ──

function initFavorites(userDataPath) {
  favoritesStore.init(userDataPath);
}

function initStores(userDataPath) {
  initHistory(userDataPath);
  initFavorites(userDataPath);
}

// ── history ──

function getHistory(limit = 20) {
  return historyStore.list({ limit });
}

function getHistoryDetail(id) {
  return historyStore.get(id);
}

function removeHistory(id) {
  return historyStore.remove(id);
}

// ── favorites ──

function addFavorite(record) {
  return favoritesStore.add(record);
}

function removeFavorite(id) {
  return favoritesStore.remove(id);
}

function listFavorites() {
  return favoritesStore.list();
}

function hasFavorite(id) {
  return favoritesStore.has(id);
}

// ── regenerate (helper에 위임만) ──

function regenerateAll(prevResponse, opts) {
  return regenerate.regenerateAllSets(prevResponse, opts);
}

function regenerateSet(prevResponse, setKey, opts) {
  return regenerate.regenerateSet(prevResponse, setKey, opts);
}

function regenerateTitle(prevResponse, setKey, opts) {
  return regenerate.regenerateTitleOnly(prevResponse, setKey, opts);
}

function regenerateThumbnail(prevResponse, setKey, opts) {
  return regenerate.regenerateThumbnailOnly(prevResponse, setKey, opts);
}

function regenerateTags(prevResponse, setKey, opts) {
  return regenerate.regenerateTagsOnly(prevResponse, setKey, opts);
}

// ── export ──

function exportJSON(response) {
  return exporter.toJSON(response);
}

function exportCSV(response) {
  return exporter.toCSV(response);
}

function exportTXT(response) {
  return exporter.toTXT(response);
}

function suggestExportFilename(response, ext) {
  return exporter.suggestFilename(response, ext);
}

// ── misc ──

function healthCheck() {
  return { status: "ok", service: "SEO Creator Engine (Node.js)" };
}

module.exports = {
  // generate
  generateFromManual,
  generateFromLink,
  // regenerate
  regenerateAll,
  regenerateSet,
  regenerateTitle,
  regenerateThumbnail,
  regenerateTags,
  // favorites
  initFavorites,
  addFavorite,
  removeFavorite,
  listFavorites,
  hasFavorite,
  // history
  getHistory,
  getHistoryDetail,
  removeHistory,
  // export
  exportJSON,
  exportCSV,
  exportTXT,
  suggestExportFilename,
  // stores
  initStores,
  initHistory,
  // misc
  healthCheck,
};
