/**
 * Title quality validator.
 *
 * 검증 항목:
 * - 길이 (YT Music ≤ 60자, YT Playlist ≤ 100자)
 * - 단어 중복 제거
 * - banned word / spam 제거
 * - 연속 공백, 양끝 punctuation 정리
 *
 * 모든 함수는 (입력, 메타) → 정리된 문자열 + 변경사항 리스트.
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { isTitleConsistent } = require("../coherence");

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

const MAX_YTM = 60;
const MAX_YTP = 100;

function _stripBanned(title, lang) {
  const d = _loadDict();
  const bw = d.banned_words || {};
  const list = lang === "en"
    ? bw.en || []
    : (bw.ko || []).concat(bw.en || []);
  let out = title;
  let removed = [];
  for (const w of list) {
    if (!w) continue;
    const re = new RegExp(`\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "gi");
    if (re.test(out)) {
      out = out.replace(re, " ");
      removed.push(w);
    }
  }
  return { out, removed };
}

function _dedupWords(title) {
  // 한국어/영어 모두 대응 — 토큰 단위 중복 제거 (대소문자 무시)
  const tokens = title.split(/\s+/);
  const seen = new Set();
  const kept = [];
  let removedCount = 0;
  for (const t of tokens) {
    const key = t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (!key) {
      kept.push(t);
      continue;
    }
    if (seen.has(key)) {
      removedCount++;
      continue;
    }
    seen.add(key);
    kept.push(t);
  }
  return { out: kept.join(" "), removed: removedCount };
}

function _normalizeWhitespace(title) {
  return title
    .replace(/\s+/g, " ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s*\|\s*\|\s*/g, " | ")
    .replace(/^\s*[\|\-–—]+\s*/, "")
    .replace(/\s*[\|\-–—]+\s*$/, "")
    .trim();
}

function _truncate(title, maxLen) {
  if (title.length <= maxLen) return { out: title, truncated: false };
  // 단어/구분자 경계에서 절단
  let cut = title.slice(0, maxLen);
  const lastSep = Math.max(cut.lastIndexOf(" | "), cut.lastIndexOf(" "));
  if (lastSep > maxLen * 0.6) {
    cut = cut.slice(0, lastSep);
  }
  return { out: cut.trim().replace(/[\|\-–—]+$/, "").trim(), truncated: true };
}

function _checkLanguageMix(title, lang) {
  // mixed/ko 모드는 통과. en 모드인데 한국어가 포함되면 경고만.
  if (lang !== "en") return { ok: true };
  const hasHangul = /[가-힣]/.test(title);
  return { ok: !hasHangul, warning: hasHangul ? "Hangul characters in EN-mode title" : null };
}

/**
 * Validate and clean a title.
 * @param {string} title
 * @param {{ situation: string, language: string, kind: "ytm"|"ytp" }} ctx
 * @returns {{ title: string, valid: boolean, issues: string[] }}
 */
function validateTitle(title, ctx) {
  const issues = [];
  if (!title || !title.trim()) {
    return { title: "", valid: false, issues: ["empty"] };
  }
  let cur = title;

  // 1) banned/spam
  const banRes = _stripBanned(cur, ctx.language);
  cur = banRes.out;
  if (banRes.removed.length) issues.push(`removed_banned:${banRes.removed.join(",")}`);

  // 2) dedup words
  const dupRes = _dedupWords(cur);
  cur = dupRes.out;
  if (dupRes.removed > 0) issues.push(`deduped:${dupRes.removed}`);

  // 3) normalize whitespace/separators
  cur = _normalizeWhitespace(cur);

  // 4) title-situation consistency
  if (ctx.situation && !isTitleConsistent(ctx.situation, cur)) {
    issues.push("conflict_with_situation");
  }

  // 5) language mix
  const lm = _checkLanguageMix(cur, ctx.language);
  if (!lm.ok) issues.push(lm.warning);

  // 6) length cap
  const max = ctx.kind === "ytm" ? MAX_YTM : MAX_YTP;
  const tr = _truncate(cur, max);
  if (tr.truncated) issues.push(`truncated:${max}`);
  cur = tr.out;

  // valid 판정 — empty/conflict_with_situation는 fail
  const fatal = issues.some((s) =>
    s === "empty" || s === "conflict_with_situation"
  );
  return { title: cur, valid: !fatal && cur.length > 0, issues };
}

module.exports = { validateTitle, MAX_YTM, MAX_YTP };
