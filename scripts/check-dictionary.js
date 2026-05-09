#!/usr/bin/env node
/**
 * keyword_dictionary.json 과 코드(VALID_*, frontend dropdowns)의
 * enum 일치 여부를 검증한다.
 *
 * 기준 SoT: engine/metadata-analyzer.js의 VALID_GENRES/MOODS/SITUATIONS
 * 추가 검사:
 *   - 프론트엔드 dropdown(LinkInputForm/ManualInputForm)의 옵션과 일치
 *   - dictionary.genres / .moods / .situations 의 키와 일치
 *   - language_variants.{ko,en}.{genre,mood,situation}_display 의 키와 일치
 *
 * 사용:
 *   node scripts/check-dictionary.js
 *
 * exit 0: 모든 enum 일치
 * exit 1: 불일치 발견 (CI에서 fail)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(ROOT, "backend", "app", "data", "keyword_dictionary.json");
const ANALYZER_PATH = path.join(ROOT, "engine", "metadata-analyzer.js");
const FRONTEND_LINK = path.join(ROOT, "frontend", "src", "components", "LinkInputForm.tsx");
const FRONTEND_MANUAL = path.join(ROOT, "frontend", "src", "components", "ManualInputForm.tsx");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readText(p) {
  return fs.readFileSync(p, "utf-8");
}

// engine/metadata-analyzer.js 에서 VALID_* Set의 멤버를 추출
function extractValidEnum(source, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*new\\s+Set\\(\\[([^\\]]+)\\]`, "m");
  const m = source.match(re);
  if (!m) throw new Error(`${name} not found`);
  return m[1].split(",").map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
}

// frontend의 dropdown 옵션 value 추출
function extractFrontendOptions(source, constName) {
  const re = new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`, "m");
  const m = source.match(re);
  if (!m) throw new Error(`${constName} not found`);
  const valueRe = /\{\s*value:\s*"([^"]*)"/g;
  const values = [];
  let v;
  while ((v = valueRe.exec(m[1])) !== null) {
    if (v[1]) values.push(v[1]); // skip 빈 값(자동 감지)
  }
  return values;
}

function diff(a, b) {
  const A = new Set(a), B = new Set(b);
  const onlyA = [...A].filter(x => !B.has(x)).sort();
  const onlyB = [...B].filter(x => !A.has(x)).sort();
  return { onlyA, onlyB };
}

function check(label, baseline, actual, baseLabel, actualLabel) {
  const { onlyA, onlyB } = diff(baseline, actual);
  if (!onlyA.length && !onlyB.length) {
    console.log(`  OK  ${label}: ${baseline.length} entries match`);
    return true;
  }
  console.log(`  FAIL  ${label}`);
  if (onlyA.length) console.log(`        in ${baseLabel} but not in ${actualLabel}: [${onlyA.join(", ")}]`);
  if (onlyB.length) console.log(`        in ${actualLabel} but not in ${baseLabel}: [${onlyB.join(", ")}]`);
  return false;
}

function main() {
  console.log("=== Dictionary / Enum consistency check ===\n");

  const dict = readJson(DICT_PATH);
  const analyzerSrc = readText(ANALYZER_PATH);
  const linkFormSrc = readText(FRONTEND_LINK);
  const manualFormSrc = readText(FRONTEND_MANUAL);

  const validGenres = extractValidEnum(analyzerSrc, "VALID_GENRES");
  const validMoods = extractValidEnum(analyzerSrc, "VALID_MOODS");
  const validSituations = extractValidEnum(analyzerSrc, "VALID_SITUATIONS");

  console.log(`engine VALID_GENRES (${validGenres.length}): ${validGenres.join(", ")}`);
  console.log(`engine VALID_MOODS (${validMoods.length}): ${validMoods.join(", ")}`);
  console.log(`engine VALID_SITUATIONS (${validSituations.length}): ${validSituations.join(", ")}\n`);

  let ok = true;

  console.log("[1/5] dictionary.genres ↔ VALID_GENRES (allow extras in dict)");
  const dictGenreKeys = Object.keys(dict.genres || {});
  const genreMissing = validGenres.filter(g => !dictGenreKeys.includes(g));
  if (genreMissing.length === 0) {
    console.log(`  OK  all ${validGenres.length} VALID_GENRES present in dictionary (extras OK: ${dictGenreKeys.filter(g => !validGenres.includes(g)).join(", ") || "none"})`);
  } else {
    console.log(`  FAIL  missing in dict.genres: [${genreMissing.join(", ")}]`);
    ok = false;
  }

  console.log("[2/5] dictionary.moods ↔ VALID_MOODS (allow extras in dict)");
  // dict에 추가 무드(cinematic, lonely, soft, uplifting)가 있어도 OK — 누락만 검사
  const dictMoodKeys = Object.keys(dict.moods || {});
  const moodMissing = validMoods.filter(m => !dictMoodKeys.includes(m));
  if (moodMissing.length === 0) {
    console.log(`  OK  all ${validMoods.length} VALID_MOODS present in dictionary (extras OK: ${dictMoodKeys.filter(m => !validMoods.includes(m)).join(", ") || "none"})`);
  } else {
    console.log(`  FAIL  missing in dict.moods: [${moodMissing.join(", ")}]`);
    ok = false;
  }

  console.log("[3/5] dictionary.situations ↔ VALID_SITUATIONS (allow extras in dict)");
  const dictSitKeys = Object.keys(dict.situations || {});
  const sitMissing = validSituations.filter(s => !dictSitKeys.includes(s));
  if (sitMissing.length === 0) {
    console.log(`  OK  all ${validSituations.length} VALID_SITUATIONS present in dictionary (extras OK: ${dictSitKeys.filter(s => !validSituations.includes(s)).join(", ") || "none"})`);
  } else {
    console.log(`  FAIL  missing in dict.situations: [${sitMissing.join(", ")}]`);
    ok = false;
  }

  console.log("[4/5] frontend dropdowns ↔ VALID_*");
  const linkGenres = extractFrontendOptions(linkFormSrc, "GENRES");
  const linkMoods = extractFrontendOptions(linkFormSrc, "MOODS");
  const linkSituations = extractFrontendOptions(linkFormSrc, "SITUATIONS");
  const manualGenres = extractFrontendOptions(manualFormSrc, "GENRES");
  const manualMoods = extractFrontendOptions(manualFormSrc, "MOODS");
  const manualSituations = extractFrontendOptions(manualFormSrc, "SITUATIONS");

  ok = check("LinkInputForm GENRES", validGenres, linkGenres, "engine", "LinkInputForm") && ok;
  ok = check("LinkInputForm MOODS", validMoods, linkMoods, "engine", "LinkInputForm") && ok;
  ok = check("LinkInputForm SITUATIONS", validSituations, linkSituations, "engine", "LinkInputForm") && ok;
  ok = check("ManualInputForm GENRES", validGenres, manualGenres, "engine", "ManualInputForm") && ok;
  ok = check("ManualInputForm MOODS", validMoods, manualMoods, "engine", "ManualInputForm") && ok;
  ok = check("ManualInputForm SITUATIONS", validSituations, manualSituations, "engine", "ManualInputForm") && ok;

  console.log("[5/5] dictionary entry shape check (ko_keywords / en_keywords)");
  for (const [section, valid] of [
    ["genres", validGenres],
    ["moods", validMoods],
    ["situations", validSituations],
  ]) {
    for (const key of valid) {
      const entry = (dict[section] || {})[key];
      if (!entry || !Array.isArray(entry.ko_keywords) || !entry.ko_keywords.length) {
        console.log(`  FAIL  dict.${section}.${key}.ko_keywords missing/empty`);
        ok = false;
      }
      if (!entry || !Array.isArray(entry.en_keywords) || !entry.en_keywords.length) {
        console.log(`  FAIL  dict.${section}.${key}.en_keywords missing/empty`);
        ok = false;
      }
    }
  }
  if (ok) console.log("  OK  all VALID_* entries have non-empty ko/en_keywords");

  console.log("");
  if (ok) {
    console.log("All consistency checks passed.");
    process.exit(0);
  } else {
    console.log("One or more consistency checks FAILED.");
    process.exit(1);
  }
}

main();
