/**
 * SEO Creator Engine (Node.js)
 *
 * Electron main process에서 직접 호출.
 * FastAPI/Python 없이 모든 로직을 Node.js에서 실행.
 */

const { v4: uuidv4 } = require("uuid");
const { analyzePlaylist } = require("./metadata-analyzer");
const { pickCompatibleMood, filterCompatibleMoods } = require("./coherence");
const { collectKeywords, generateCombinationKeywords, generateLongtailKeywords, scoreAllKeywords } = require("./keyword-engine");
const { generateTitleSets } = require("./title-generator");
const { generateThumbnail } = require("./thumbnail-generator");
const { explainResultSet } = require("./explainer");
const { classifyIntent } = require("./intent-classifier");
const { parsePlaylist } = require("./playlist-parser");

// ── DB (better-sqlite3 대신 간단한 JSON 파일 히스토리) ──
const path = require("path");
const fs = require("fs");

let _historyDir = null;

function initHistory(userDataPath) {
  _historyDir = userDataPath;
  const dir = path.join(userDataPath, "history");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _saveHistory(id, data) {
  if (!_historyDir) return;
  try {
    fs.writeFileSync(
      path.join(_historyDir, "history", `${id}.json`),
      JSON.stringify(data, null, 2),
      "utf-8"
    );
  } catch (_) {}
}

function _getHistory(limit = 20) {
  if (!_historyDir) return [];
  const dir = path.join(_historyDir, "history");
  if (!fs.existsSync(dir)) return [];
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().reverse().slice(0, limit);
    return files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      return { id: data.generationId, inputType: data.inputType, seoScore: data.seoScore, createdAt: data.createdAt };
    });
  } catch { return []; }
}

// ── 핵심: 결과 생성 ──

function _buildResponse(analysis, language) {
  // situation-first mood 보정
  const compatMood = pickCompatibleMood(analysis.primarySituation, analysis.detectedMoods);
  analysis.primaryMood = compatMood;
  analysis.detectedMoods = filterCompatibleMoods(analysis.primarySituation, analysis.detectedMoods, 3);

  // 키워드 수집 + 점수화
  let allKw = [
    ...collectKeywords(analysis),
    ...generateCombinationKeywords(analysis),
    ...generateLongtailKeywords(analysis),
  ];
  allKw = [...new Set(allKw)];
  const keywordScores = scoreAllKeywords(allKw, analysis);

  // 제목 3세트
  const titleSets = generateTitleSets(analysis, keywordScores, language);

  // 각 세트에 썸네일 + explanation
  const results = titleSets.map(ts => {
    const thumb = generateThumbnail(analysis, language);
    const avgScore = keywordScores.length > 0
      ? keywordScores.slice(0, 5).reduce((s, k) => s + k.totalScore, 0) / Math.min(5, keywordScores.length)
      : 0.5;
    const expl = explainResultSet(ts.ytMusicTitle, ts.ytPlaylistTitle, ts.setLabel);
    return {
      setLabel: ts.setLabel,
      ytMusicTitle: ts.ytMusicTitle,
      ytPlaylistTitle: ts.ytPlaylistTitle,
      thumbnail: thumb,
      seoScore: +(avgScore * 100).toFixed(1),
      explanation: expl,
    };
  });

  const genId = uuidv4().substring(0, 8);

  return {
    analysis,
    keywordScores: keywordScores.slice(0, 15),
    results,
    generationId: genId,
    trendEnhanced: false,
    trendsSource: "off",
    trendKeywords: [],
    trendCacheHit: false,
  };
}

// ── 공개 API ──

function generateFromManual({ genre, mood, situation, language = "ko", emotion = "", referenceArtists = [], excludeKeywords = [] }) {
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
    topArtists: referenceArtists.slice(0, 5),
    keywordPool,
  };

  if (excludeKeywords.length) {
    const excl = new Set(excludeKeywords.map(k => k.toLowerCase()));
    analysis.keywordPool = analysis.keywordPool.filter(k => !excl.has(k.toLowerCase()));
  }

  const response = _buildResponse(analysis, language);
  _saveHistory(response.generationId, { ...response, inputType: "manual", createdAt: new Date().toISOString(), seoScore: response.results[0]?.seoScore || 0 });
  return response;
}

async function generateFromLink({ url, language = "ko", overrideGenre, overrideMood, overrideSituation, excludeKeywords = [] }) {
  const playlist = await parsePlaylist(url);
  if (!playlist.tracks.length) throw new Error("재생목록에 곡이 없습니다.");

  const analysis = analyzePlaylist(playlist);

  if (overrideGenre) { analysis.primaryGenre = overrideGenre; if (!analysis.detectedGenres.includes(overrideGenre)) analysis.detectedGenres.unshift(overrideGenre); }
  if (overrideMood) { analysis.primaryMood = overrideMood; if (!analysis.detectedMoods.includes(overrideMood)) analysis.detectedMoods.unshift(overrideMood); }
  if (overrideSituation) { analysis.primarySituation = overrideSituation; if (!analysis.detectedSituations.includes(overrideSituation)) analysis.detectedSituations.unshift(overrideSituation); }

  if (excludeKeywords.length) {
    const excl = new Set(excludeKeywords.map(k => k.toLowerCase()));
    analysis.keywordPool = analysis.keywordPool.filter(k => !excl.has(k.toLowerCase()));
  }

  const response = _buildResponse(analysis, language);
  _saveHistory(response.generationId, { ...response, inputType: "link", createdAt: new Date().toISOString(), seoScore: response.results[0]?.seoScore || 0 });
  return response;
}

function getHistory(limit = 20) {
  return _getHistory(limit);
}

function healthCheck() {
  return { status: "ok", service: "SEO Creator Engine (Node.js)" };
}

module.exports = { generateFromManual, generateFromLink, getHistory, healthCheck, initHistory };
