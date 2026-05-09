/**
 * SEO Creator Engine (Node.js)
 *
 * Electron main process에서 직접 호출.
 * FastAPI/Python 없이 모든 로직을 Node.js에서 실행.
 */

const crypto = require("crypto");
const { analyzePlaylist } = require("./metadata-analyzer");
const { pickCompatibleMood, filterCompatibleMoods } = require("./coherence");
const { collectKeywords, generateCombinationKeywords, generateLongtailKeywords, scoreAllKeywords } = require("./keyword-engine");
const { generateTitleSets } = require("./title-generator");
const { generateThumbnail } = require("./thumbnail-generator");
const { explainResultSet } = require("./explainer");
const { classifyIntent } = require("./intent-classifier");
const { parsePlaylist } = require("./playlist-parser");
const { scoreResultSet } = require("./score-result");

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

// seed 기반 결정론적 PRNG (mulberry32)
function _makePrng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _buildResponse(analysis, language, opts = {}) {
  const seed = opts.seed | 0;
  const rand = seed ? _makePrng(seed) : null;

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
  let keywordScores = scoreAllKeywords(allKw, analysis);

  // 재생성 시 점수에 jitter를 주어 비슷한 점수의 키워드 순위가 바뀌도록 함
  // (downstream의 _pickKwHardFiltered가 재정렬하므로 직접 score를 변형해야 한다)
  if (rand) {
    keywordScores = keywordScores.map(ks => ({
      ...ks,
      totalScore: Math.max(0, Math.min(1, ks.totalScore + (rand() - 0.5) * 0.15)),
    }));
    keywordScores.sort((a, b) => b.totalScore - a.totalScore);
  }

  // 제목 3세트
  const titleSets = generateTitleSets(analysis, keywordScores, language, { seed });

  // 각 세트에 썸네일 + explanation + 카드별 SEO 점수(제목 품질 기반)
  const results = titleSets.map(ts => {
    const thumb = generateThumbnail(analysis, language);
    const expl = explainResultSet(ts.ytMusicTitle, ts.ytPlaylistTitle, ts.setLabel);
    const { seoScore, breakdown } = scoreResultSet({
      ytMusicTitle: ts.ytMusicTitle,
      ytPlaylistTitle: ts.ytPlaylistTitle,
      setLabel: ts.setLabel,
      analysis,
      language,
    });
    return {
      setLabel: ts.setLabel,
      ytMusicTitle: ts.ytMusicTitle,
      ytPlaylistTitle: ts.ytPlaylistTitle,
      thumbnail: thumb,
      seoScore,
      scoreBreakdown: breakdown,
      explanation: expl,
    };
  });

  const genId = crypto.randomUUID().substring(0, 8);

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

function _buildManualAnalysis({ genre, mood, situation, language, emotion, referenceArtists, excludeKeywords }) {
  const keywordPool = [genre, mood, situation];
  if (emotion) keywordPool.push(emotion);
  keywordPool.push(...(referenceArtists || []));

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
    const excl = new Set(excludeKeywords.map(k => k.toLowerCase()));
    analysis.keywordPool = analysis.keywordPool.filter(k => !excl.has(k.toLowerCase()));
  }
  return analysis;
}

function generateFromManual(rawInput) {
  const input = {
    genre: rawInput.genre,
    mood: rawInput.mood,
    situation: rawInput.situation,
    language: rawInput.language || "ko",
    emotion: rawInput.emotion || "",
    referenceArtists: rawInput.referenceArtists || [],
    excludeKeywords: rawInput.excludeKeywords || [],
  };
  const analysis = _buildManualAnalysis(input);
  const response = _buildResponse(analysis, input.language);
  _saveHistory(response.generationId, {
    ...response,
    inputType: "manual",
    input,
    createdAt: new Date().toISOString(),
    seoScore: response.results[0]?.seoScore || 0,
  });
  return response;
}

async function generateFromLink(rawInput) {
  const input = {
    url: rawInput.url,
    language: rawInput.language || "ko",
    overrideGenre: rawInput.overrideGenre || "",
    overrideMood: rawInput.overrideMood || "",
    overrideSituation: rawInput.overrideSituation || "",
    excludeKeywords: rawInput.excludeKeywords || [],
  };

  const playlist = await parsePlaylist(input.url);
  if (!playlist.tracks.length) throw new Error("재생목록에 곡이 없습니다.");

  const analysis = analyzePlaylist(playlist);

  if (input.overrideGenre) { analysis.primaryGenre = input.overrideGenre; if (!analysis.detectedGenres.includes(input.overrideGenre)) analysis.detectedGenres.unshift(input.overrideGenre); }
  if (input.overrideMood) { analysis.primaryMood = input.overrideMood; if (!analysis.detectedMoods.includes(input.overrideMood)) analysis.detectedMoods.unshift(input.overrideMood); }
  if (input.overrideSituation) { analysis.primarySituation = input.overrideSituation; if (!analysis.detectedSituations.includes(input.overrideSituation)) analysis.detectedSituations.unshift(input.overrideSituation); }

  if (input.excludeKeywords.length) {
    const excl = new Set(input.excludeKeywords.map(k => k.toLowerCase()));
    analysis.keywordPool = analysis.keywordPool.filter(k => !excl.has(k.toLowerCase()));
  }

  const response = _buildResponse(analysis, input.language);
  // 재생성 시 재-파싱을 피하기 위해 분석 결과(analysis)도 저장
  _saveHistory(response.generationId, {
    ...response,
    inputType: "link",
    input,
    cachedAnalysis: response.analysis,
    createdAt: new Date().toISOString(),
    seoScore: response.results[0]?.seoScore || 0,
  });
  return response;
}

function _loadHistoryRecord(generationId) {
  if (!_historyDir || !generationId) return null;
  const file = path.join(_historyDir, "history", `${generationId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

async function regenerate(generationId) {
  const record = _loadHistoryRecord(generationId);
  if (!record || !record.input) {
    throw new Error("이전 입력을 찾을 수 없습니다. 새로 생성해 주세요.");
  }

  // 매번 다른 결과를 보장하기 위해 시간 기반 seed 사용
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

  let analysis;
  let language;

  if (record.inputType === "manual") {
    analysis = _buildManualAnalysis({
      genre: record.input.genre,
      mood: record.input.mood,
      situation: record.input.situation,
      language: record.input.language || "ko",
      emotion: record.input.emotion || "",
      referenceArtists: record.input.referenceArtists || [],
      excludeKeywords: record.input.excludeKeywords || [],
    });
    language = record.input.language || "ko";
  } else if (record.inputType === "link") {
    language = record.input.language || "ko";
    if (record.cachedAnalysis) {
      // 재-파싱 없이 캐시된 분석 결과 재사용 (가벼움)
      analysis = JSON.parse(JSON.stringify(record.cachedAnalysis));
      // override 재적용 (캐시된 분석에는 이미 override가 반영되어 있을 가능성이 높지만 안전하게)
      if (record.input.excludeKeywords && record.input.excludeKeywords.length) {
        const excl = new Set(record.input.excludeKeywords.map(k => k.toLowerCase()));
        analysis.keywordPool = (analysis.keywordPool || []).filter(k => !excl.has(k.toLowerCase()));
      }
    } else {
      // 캐시 없으면 다시 파싱
      const playlist = await parsePlaylist(record.input.url);
      if (!playlist.tracks.length) throw new Error("재생목록에 곡이 없습니다.");
      analysis = analyzePlaylist(playlist);
      if (record.input.overrideGenre) { analysis.primaryGenre = record.input.overrideGenre; }
      if (record.input.overrideMood) { analysis.primaryMood = record.input.overrideMood; }
      if (record.input.overrideSituation) { analysis.primarySituation = record.input.overrideSituation; }
    }
  } else {
    throw new Error("알 수 없는 입력 타입입니다.");
  }

  const response = _buildResponse(analysis, language, { seed });
  _saveHistory(response.generationId, {
    ...response,
    inputType: record.inputType,
    input: record.input,
    cachedAnalysis: record.inputType === "link" ? (record.cachedAnalysis || response.analysis) : undefined,
    createdAt: new Date().toISOString(),
    seoScore: response.results[0]?.seoScore || 0,
  });
  return response;
}

function getHistory(limit = 20) {
  return _getHistory(limit);
}

function healthCheck() {
  return { status: "ok", service: "SEO Creator Engine (Node.js)" };
}

module.exports = { generateFromManual, generateFromLink, regenerate, getHistory, healthCheck, initHistory };
