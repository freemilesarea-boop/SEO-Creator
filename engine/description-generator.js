/**
 * Description / Tags / Hashtags generator.
 *
 * 결과 세트마다 YouTube 설명문, 태그(쉼표 구분), 해시태그를 생성한다.
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { resolveGenre, resolveSituation } = require("./util/aliases");

let _dict = null;
function loadDict() {
  if (!_dict) {
    _dict = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "keyword_dictionary.json"), "utf-8")
    );
  }
  return _dict;
}

const DESC_KO_TEMPLATES = [
  "{ytp}\n\n{situation_ko} 분위기에 어울리는 {mood_ko} {genre_ko} 곡들을 모았습니다.\n잔잔하게 흘려두기 좋은 플레이리스트, 작업/공부/드라이브에도 잘 어울려요.\n\n▶ 마음에 드셨다면 좋아요와 구독 부탁드립니다.\n▶ 추가했으면 하는 곡이 있다면 댓글로 알려주세요.",
  "{ytp}\n\n{mood_ko} 무드의 {genre_ko}만 골라 담은 플레이리스트입니다.\n{situation_ko}에 잘 어울리니, 헤드폰 끼고 한 곡 한 곡 천천히 들어보세요.\n\n• 장르: {genre_ko}\n• 무드: {mood_ko}\n• 추천 상황: {situation_ko}\n\n좋아요와 구독은 다음 플레이리스트로 이어집니다.",
];

const DESC_EN_TEMPLATES = [
  "{ytp}\n\nA hand-picked playlist of {mood_en} {genre_en} songs perfect for {situation_en}.\nLet it play in the background — works great for studying, driving, or chilling out.\n\n▶ Like and subscribe if you enjoyed it.\n▶ Drop your favorite track in the comments.",
  "{ytp}\n\nFeeling that {mood_en} mood? This {genre_en} mix is curated for {situation_en} moments.\n\n• Genre: {genre_en}\n• Mood: {mood_en}\n• Best for: {situation_en}\n\nFollow the channel for more playlists like this.",
];

function _displayName(key, section, lang) {
  const d = loadDict();
  const lookup = section === "genres" ? resolveGenre(key)
    : section === "situations" ? resolveSituation(key) : key;
  const dispSec = { genres: "genre_display", moods: "mood_display", situations: "situation_display" }[section];
  const v = ((d.language_variants || {})[lang] || {})[dispSec] || {};
  if (v[lookup]) return v[lookup];
  const e = (d[section] || {})[lookup] || {};
  const pool = lang === "ko" ? (e.ko_keywords || []) : (e.en_keywords || []);
  return pool[0] || lookup.replace(/_/g, " ");
}

function _topKeywords(d, key, section, lang, n) {
  const lookup = section === "genres" ? resolveGenre(key)
    : section === "situations" ? resolveSituation(key) : key;
  const e = (d[section] || {})[lookup] || {};
  const pool = lang === "ko" ? (e.ko_keywords || []) : (e.en_keywords || []);
  return pool.slice(0, n);
}

/**
 * Build YouTube description, tags, and hashtags for a result set.
 *
 * @param {object} analysis
 * @param {{ ytMusicTitle:string, ytPlaylistTitle:string, setKey:string }} resultSet
 * @param {string} language
 * @returns {{ description:string, tags:string[], hashtags:string[] }}
 */
function buildDescriptionPack(analysis, resultSet, language) {
  const d = loadDict();
  const lang = language === "en" ? "en" : "ko";
  const genreKey = resolveGenre(analysis.primaryGenre);
  const situationKey = resolveSituation(analysis.primarySituation);
  const moodKey = analysis.primaryMood;

  const genreDisp = _displayName(genreKey, "genres", lang);
  const moodDisp = _displayName(moodKey, "moods", lang);
  const sitDisp = _displayName(situationKey, "situations", lang);

  // 1) description
  const tmpls = lang === "en" ? DESC_EN_TEMPLATES : DESC_KO_TEMPLATES;
  // setKey 별로 약간 다른 톤 사용 — emotional은 첫번째, search/longtail은 두번째
  const tmpl = resultSet.setKey === "emotional" ? tmpls[0] : tmpls[1];
  const description = tmpl
    .replace(/\{ytp\}/g, resultSet.ytPlaylistTitle || resultSet.ytMusicTitle || "")
    .replace(/\{genre_ko\}/g, _displayName(genreKey, "genres", "ko"))
    .replace(/\{mood_ko\}/g, _displayName(moodKey, "moods", "ko"))
    .replace(/\{situation_ko\}/g, _displayName(situationKey, "situations", "ko"))
    .replace(/\{genre_en\}/g, _displayName(genreKey, "genres", "en"))
    .replace(/\{mood_en\}/g, _displayName(moodKey, "moods", "en"))
    .replace(/\{situation_en\}/g, _displayName(situationKey, "situations", "en"));

  // 2) tags — 다국어 혼합으로 검색 노출 극대화
  const tagSet = new Set();
  for (const k of _topKeywords(d, genreKey, "genres", "ko", 4)) tagSet.add(k);
  for (const k of _topKeywords(d, genreKey, "genres", "en", 4)) tagSet.add(k);
  for (const k of _topKeywords(d, moodKey, "moods", "ko", 3)) tagSet.add(k);
  for (const k of _topKeywords(d, moodKey, "moods", "en", 3)) tagSet.add(k);
  for (const k of _topKeywords(d, situationKey, "situations", "ko", 3)) tagSet.add(k);
  for (const k of _topKeywords(d, situationKey, "situations", "en", 3)) tagSet.add(k);
  // playlist 키워드
  ["playlist", "플레이리스트", "music", "노래 모음", "BGM", "mix"].forEach((t) => tagSet.add(t));
  // setKey 보너스
  if (resultSet.setKey === "emotional") ["감성","mood","vibes"].forEach((t) => tagSet.add(t));
  if (resultSet.setKey === "search") ["추천","best","top"].forEach((t) => tagSet.add(t));
  if (resultSet.setKey === "longtail") ["듣기 좋은","while","for"].forEach((t) => tagSet.add(t));

  const tags = [...tagSet].slice(0, 30);

  // 3) hashtags — 짧고 검색 가능하게, 공백 제거
  function _toHashtag(s) {
    return "#" + s.replace(/[^\p{L}\p{N}_]/gu, "");
  }
  const tagSeeds = [
    genreDisp,
    moodDisp,
    sitDisp,
    "Playlist",
    lang === "ko" ? "노래모음" : "MusicMix",
    lang === "ko" ? "감성플리" : "VibeMix",
  ];
  const hashSet = new Set();
  for (const s of tagSeeds) {
    if (!s) continue;
    const h = _toHashtag(s);
    if (h.length > 1) hashSet.add(h);
  }
  const hashtags = [...hashSet].slice(0, 8);

  return { description, tags, hashtags };
}

module.exports = { buildDescriptionPack };
