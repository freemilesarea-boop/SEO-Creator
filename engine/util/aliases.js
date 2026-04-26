/**
 * Alias resolution for genre / situation enums.
 *
 * 프론트 enum과 사전 키가 1:1로 맞지 않을 때, alias 맵을 통해
 * 안전하게 사전 키로 변환한다.
 *
 * 예) electronic → edm, citypop → jpop, late_night → night_drive
 */

"use strict";

const path = require("path");
const fs = require("fs");

let _dict = null;
function _loadDict() {
  if (_dict === null) {
    try {
      _dict = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "data", "keyword_dictionary.json"), "utf-8")
      );
    } catch (_) {
      _dict = {};
    }
  }
  return _dict;
}

/**
 * @param {string} genreKey
 * @returns {string} canonical genre key resolved against dictionary
 */
function resolveGenre(genreKey) {
  if (!genreKey) return genreKey;
  const d = _loadDict();
  if (d.genres && d.genres[genreKey]) return genreKey;
  const aliases = d.genre_aliases || {};
  if (aliases[genreKey] && d.genres && d.genres[aliases[genreKey]]) {
    return aliases[genreKey];
  }
  return genreKey;
}

/**
 * @param {string} situationKey
 * @returns {string} canonical situation key resolved against dictionary
 */
function resolveSituation(situationKey) {
  if (!situationKey) return situationKey;
  const d = _loadDict();
  if (d.situations && d.situations[situationKey]) return situationKey;
  const aliases = d.situation_aliases || {};
  if (aliases[situationKey] && d.situations && d.situations[aliases[situationKey]]) {
    return aliases[situationKey];
  }
  return situationKey;
}

/**
 * Produce a canonical analysis object — primaryGenre/primarySituation 등을 사전 키로 보정.
 * mutates a shallow copy.
 */
function normalizeAnalysis(analysis) {
  const a = { ...analysis };
  a.primaryGenre = resolveGenre(a.primaryGenre);
  a.primarySituation = resolveSituation(a.primarySituation);
  if (Array.isArray(a.detectedGenres)) {
    a.detectedGenres = a.detectedGenres.map(resolveGenre);
  }
  if (Array.isArray(a.detectedSituations)) {
    a.detectedSituations = a.detectedSituations.map(resolveSituation);
  }
  return a;
}

module.exports = { resolveGenre, resolveSituation, normalizeAnalysis };
