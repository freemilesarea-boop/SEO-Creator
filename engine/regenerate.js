/**
 * Regenerate — 기존 GenerationResponse를 기반으로 부분/전체 재생성.
 *
 * 원칙:
 * - prevResponse는 절대 mutate하지 않는다 (deep clone 후 변경).
 * - 영역별 함수 (title/thumbnail/tags/set/all)는 명시된 영역만 교체한다.
 * - 모든 함수는 scoring.js로 점수를 다시 계산하여 결과에 반영한다.
 * - 메타: regeneratedAt, regeneratedType, seedSalt 필드를 응답에 추가.
 */

"use strict";

const { generateTitleSets } = require("./title-generator");
const { generateThumbnail } = require("./thumbnail-generator");
const { buildDescriptionPack } = require("./description-generator");
const { explainResultSet } = require("./explainer");
const { perSetScore, titleDiversity } = require("./scoring");
const { hashSeed } = require("./util/seeded-random");

const VALID_SET_KEYS = ["emotional", "search", "longtail"];

// ── helpers ──

function _clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _err(message) {
  return { ok: false, error: message };
}

function _validateInput(prevResponse) {
  if (!prevResponse || typeof prevResponse !== "object") return "prevResponse is required";
  if (!prevResponse.analysis) return "prevResponse.analysis is missing";
  if (!Array.isArray(prevResponse.results) || !prevResponse.results.length) {
    return "prevResponse.results is empty";
  }
  return null;
}

function _findSetIdx(results, setKey) {
  if (!VALID_SET_KEYS.includes(setKey)) return -1;
  return results.findIndex((s) => s && s.setKey === setKey);
}

/**
 * seedSalt가 있으면 그것으로 hash, 없으면 새로 생성.
 * @param {string|number|null|undefined} seedSalt
 * @returns {{ seed: number, seedSalt: string|number }}
 */
function _makeSeed(seedSalt) {
  if (seedSalt !== undefined && seedSalt !== null && seedSalt !== "") {
    return { seed: hashSeed(seedSalt), seedSalt };
  }
  const salt = `${Date.now()}-${Math.random()}`;
  return { seed: hashSeed(salt), seedSalt: salt };
}

function _attachMeta(response, type, seedSalt) {
  response.regeneratedAt = new Date().toISOString();
  response.regeneratedType = type;
  response.seedSalt = seedSalt;
  return response;
}

function _languageOf(response) {
  return (
    (response && response.language) ||
    (response && response.analysis && response.analysis.language) ||
    "ko"
  );
}

/**
 * 모든 세트의 점수를 다시 계산한다 (diversity 포함).
 */
function _recomputeAllScores(response) {
  const div = titleDiversity(response.results);
  for (const set of response.results) {
    const r = perSetScore(set, response.analysis, response.keywordScores, {
      diversityBonus: (div.perSet && div.perSet[set.setKey]) || 0,
    });
    set.seoScore = r.total;
    set.breakdown = r.breakdown;
  }
  return response;
}

// ── regenerateAllSets ──

/**
 * 모든 세트의 title + thumbnail + descriptionPack을 새 seed로 재생성.
 * @param {object} prevResponse
 * @param {{ seedSalt?: string|number }} [opts]
 * @returns {{ok:true, response:object} | {ok:false, error:string}}
 */
function regenerateAllSets(prevResponse, opts) {
  const err = _validateInput(prevResponse);
  if (err) return _err(err);
  const cloned = _clone(prevResponse);
  const language = _languageOf(cloned);
  const { seed, seedSalt } = _makeSeed(opts && opts.seedSalt);

  const fresh = generateTitleSets(cloned.analysis, cloned.keywordScores, language, seed);
  const byKey = {};
  for (const s of fresh) byKey[s.setKey] = s;

  for (const old of cloned.results) {
    const f = byKey[old.setKey];
    if (!f) continue;
    old.ytMusicTitle = f.ytMusicTitle;
    old.ytPlaylistTitle = f.ytPlaylistTitle;
    old.usedKeywords = f.usedKeywords;
    old.intent = f.intent;
    old.setLabel = f.setLabel;
    old.thumbnail = generateThumbnail(
      cloned.analysis,
      language,
      hashSeed(`${seed}-${old.setKey}-thumb`)
    );
    old.descriptionPack = buildDescriptionPack(cloned.analysis, old, language);
    old.explanation = explainResultSet(old.ytMusicTitle, old.ytPlaylistTitle, old.setLabel);
  }

  _recomputeAllScores(cloned);
  return { ok: true, response: _attachMeta(cloned, "all", seedSalt) };
}

// ── regenerateSet (단일 세트, 모든 영역) ──

function regenerateSet(prevResponse, setKey, opts) {
  const err = _validateInput(prevResponse);
  if (err) return _err(err);
  const cloned = _clone(prevResponse);
  const idx = _findSetIdx(cloned.results, setKey);
  if (idx < 0) return _err(`unknown setKey: ${setKey}`);

  const language = _languageOf(cloned);
  const { seed, seedSalt } = _makeSeed(opts && opts.seedSalt);
  const fresh = generateTitleSets(cloned.analysis, cloned.keywordScores, language, seed)
    .find((s) => s.setKey === setKey);
  if (!fresh) return _err(`generator returned no set for ${setKey}`);

  const target = cloned.results[idx];
  target.ytMusicTitle = fresh.ytMusicTitle;
  target.ytPlaylistTitle = fresh.ytPlaylistTitle;
  target.usedKeywords = fresh.usedKeywords;
  target.intent = fresh.intent;
  target.setLabel = fresh.setLabel;
  target.thumbnail = generateThumbnail(
    cloned.analysis,
    language,
    hashSeed(`${seed}-${setKey}-thumb`)
  );
  target.descriptionPack = buildDescriptionPack(cloned.analysis, target, language);
  target.explanation = explainResultSet(target.ytMusicTitle, target.ytPlaylistTitle, target.setLabel);

  _recomputeAllScores(cloned);
  return { ok: true, response: _attachMeta(cloned, `set:${setKey}`, seedSalt) };
}

// ── regenerateTitleOnly ──

function regenerateTitleOnly(prevResponse, setKey, opts) {
  const err = _validateInput(prevResponse);
  if (err) return _err(err);
  const cloned = _clone(prevResponse);
  const idx = _findSetIdx(cloned.results, setKey);
  if (idx < 0) return _err(`unknown setKey: ${setKey}`);

  const language = _languageOf(cloned);
  const { seed, seedSalt } = _makeSeed(opts && opts.seedSalt);
  const fresh = generateTitleSets(cloned.analysis, cloned.keywordScores, language, seed)
    .find((s) => s.setKey === setKey);
  if (!fresh) return _err(`generator returned no set for ${setKey}`);

  const target = cloned.results[idx];
  target.ytMusicTitle = fresh.ytMusicTitle;
  target.ytPlaylistTitle = fresh.ytPlaylistTitle;
  target.usedKeywords = fresh.usedKeywords;
  target.intent = fresh.intent;
  target.setLabel = fresh.setLabel;
  target.explanation = explainResultSet(target.ytMusicTitle, target.ytPlaylistTitle, target.setLabel);
  // thumbnail / descriptionPack 보존

  _recomputeAllScores(cloned);
  return { ok: true, response: _attachMeta(cloned, `title:${setKey}`, seedSalt) };
}

// ── regenerateThumbnailOnly ──

function regenerateThumbnailOnly(prevResponse, setKey, opts) {
  const err = _validateInput(prevResponse);
  if (err) return _err(err);
  const cloned = _clone(prevResponse);
  const idx = _findSetIdx(cloned.results, setKey);
  if (idx < 0) return _err(`unknown setKey: ${setKey}`);

  const language = _languageOf(cloned);
  const { seed, seedSalt } = _makeSeed(opts && opts.seedSalt);

  const target = cloned.results[idx];
  target.thumbnail = generateThumbnail(
    cloned.analysis,
    language,
    hashSeed(`${seed}-${setKey}-thumb`)
  );
  // title / descriptionPack / explanation 보존

  _recomputeAllScores(cloned);
  return { ok: true, response: _attachMeta(cloned, `thumbnail:${setKey}`, seedSalt) };
}

// ── regenerateTagsOnly ──

function regenerateTagsOnly(prevResponse, setKey, opts) {
  const err = _validateInput(prevResponse);
  if (err) return _err(err);
  const cloned = _clone(prevResponse);
  const idx = _findSetIdx(cloned.results, setKey);
  if (idx < 0) return _err(`unknown setKey: ${setKey}`);

  const language = _languageOf(cloned);
  const { seedSalt } = _makeSeed(opts && opts.seedSalt);

  const target = cloned.results[idx];
  target.descriptionPack = buildDescriptionPack(cloned.analysis, target, language);
  // title / thumbnail / explanation 보존

  _recomputeAllScores(cloned);
  return { ok: true, response: _attachMeta(cloned, `tags:${setKey}`, seedSalt) };
}

module.exports = {
  regenerateAllSets,
  regenerateSet,
  regenerateTitleOnly,
  regenerateThumbnailOnly,
  regenerateTagsOnly,
  VALID_SET_KEYS,
};
