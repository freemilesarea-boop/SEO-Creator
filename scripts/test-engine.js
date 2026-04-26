#!/usr/bin/env node
/**
 * scripts/test-engine.js
 *
 * SEO Creator engine self-check.
 *
 * - 외부 패키지 사용 안 함 (stdlib only)
 * - Electron / network 없이 동작 (network 의존 검증은 URL validation 정도로 한정)
 * - 16개 검증 항목, 실패 시 process.exit(1)
 *
 * 사용:
 *   node scripts/test-engine.js
 *   npm run test:engine
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const engine = require(path.join(ROOT, "engine"));

let _passed = 0;
let _failed = 0;
const _failures = [];

function _step(name) {
  console.log(`\n[${name}]`);
}

function _ok(label) {
  _passed++;
  console.log(`  PASS  ${label}`);
}

function _fail(label, reason) {
  _failed++;
  _failures.push({ label, reason });
  console.log(`  FAIL  ${label} — ${reason}`);
}

function assert(cond, label, reason = "assertion failed") {
  if (cond) _ok(label);
  else _fail(label, reason);
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seo-test-engine-"));
  engine.initStores(tmp);

  // 1. healthCheck
  _step("1. healthCheck");
  try {
    const h = engine.healthCheck();
    assert(h && h.status === "ok", "status=ok", `got=${JSON.stringify(h)}`);
    assert(typeof h.service === "string" && h.service.length > 0, "service string present");
  } catch (e) {
    _fail("healthCheck", e.message);
  }

  // 2. generateFromManual
  _step("2. generateFromManual");
  let manual = null;
  try {
    manual = engine.generateFromManual({
      genre: "lofi",
      mood: "chill",
      situation: "study",
      language: "ko",
    });
    assert(typeof manual.generationId === "string" && manual.generationId.length === 8,
      "generationId 8 chars");
    assert(Array.isArray(manual.results), "results is array");
    assert(typeof manual.createdAt === "string", "createdAt string");
  } catch (e) {
    _fail("generateFromManual", e.message);
  }

  // 3. generateFromLink — 네트워크 없이 URL validation만
  _step("3. generateFromLink (validation)");
  try {
    let threw = false;
    let errMsg = "";
    try {
      await engine.generateFromLink({ url: "not-a-url" });
    } catch (e) {
      threw = true;
      errMsg = e.message;
    }
    assert(threw, "invalid URL throws", "no throw for malformed URL");
    assert(typeof errMsg === "string" && errMsg.length > 0, "error message present");

    // missing url field
    let threwMissing = false;
    try { await engine.generateFromLink({}); }
    catch (_) { threwMissing = true; }
    assert(threwMissing, "missing url throws");
  } catch (e) {
    _fail("generateFromLink", e.message);
  }

  // 4. 3 sets
  _step("4. 3 sets generated");
  if (manual) {
    assert(manual.results.length === 3, "results.length === 3");
    const keys = manual.results.map((r) => r.setKey).sort().join(",");
    assert(keys === "emotional,longtail,search", `setKeys`, `got ${keys}`);
    for (const s of manual.results) {
      assert(typeof s.ytMusicTitle === "string" && s.ytMusicTitle.length > 0,
        `set ${s.setKey}: ytMusicTitle non-empty`);
      assert(typeof s.ytPlaylistTitle === "string" && s.ytPlaylistTitle.length > 0,
        `set ${s.setKey}: ytPlaylistTitle non-empty`);
    }
  } else {
    _fail("3 sets", "manual generation skipped");
  }

  // 5. per-set seoScore distinct
  _step("5. per-set seoScore distinct");
  if (manual) {
    const scores = manual.results.map((r) => r.seoScore);
    const distinct = new Set(scores).size;
    assert(distinct >= 2, "≥ 2 distinct scores", `scores=${scores.join(",")}`);
    for (const s of manual.results) {
      assert(typeof s.seoScore === "number" && s.seoScore >= 0 && s.seoScore <= 100,
        `set ${s.setKey}: seoScore in 0..100`);
      assert(s.breakdown && typeof s.breakdown.intentFit === "number",
        `set ${s.setKey}: breakdown present`);
    }
  }

  // 6. descriptionPack
  _step("6. descriptionPack present");
  if (manual) {
    const all = manual.results.every((r) =>
      r.descriptionPack &&
      typeof r.descriptionPack.description === "string" &&
      r.descriptionPack.description.length > 0 &&
      Array.isArray(r.descriptionPack.tags) &&
      Array.isArray(r.descriptionPack.hashtags)
    );
    assert(all, "every set has description/tags/hashtags");
  }

  // 7. thumbnail v2 fields
  _step("7. thumbnail v2 fields");
  if (manual) {
    for (const s of manual.results) {
      const t = s.thumbnail || {};
      assert(typeof t.fontFeel === "string" && t.fontFeel.length > 0,
        `set ${s.setKey}: fontFeel`);
      assert(Array.isArray(t.avoidList) && t.avoidList.length > 0,
        `set ${s.setKey}: avoidList non-empty`);
      assert(Array.isArray(t.photoSearchKeywords) && t.photoSearchKeywords.length > 0,
        `set ${s.setKey}: photoSearchKeywords non-empty`);
    }
  }

  // 8. regenerateSet
  _step("8. regenerateSet");
  if (manual) {
    const r = engine.regenerateSet(manual, "search", { seedSalt: "test-8" });
    assert(r.ok === true, "ok=true");
    assert(r.response && r.response.regeneratedType === "set:search",
      "regeneratedType=set:search");
    const bad = engine.regenerateSet(manual, "INVALID");
    assert(bad.ok === false && /unknown setKey/.test(bad.error || ""),
      "invalid setKey → ok:false with error");
  }

  // 9. regenerateTitle
  _step("9. regenerateTitle");
  if (manual) {
    const before = JSON.stringify(manual);
    const idx = manual.results.findIndex((s) => s.setKey === "longtail");
    const r = engine.regenerateTitle(manual, "longtail", { seedSalt: "test-9" });
    assert(r.ok === true, "ok=true");
    assert(r.response.regeneratedType === "title:longtail", "regeneratedType");
    const after = r.response.results[idx];
    const orig = manual.results[idx];
    assert(JSON.stringify(after.thumbnail) === JSON.stringify(orig.thumbnail),
      "thumbnail preserved");
    assert(JSON.stringify(after.descriptionPack) === JSON.stringify(orig.descriptionPack),
      "descriptionPack preserved");
    assert(JSON.stringify(manual) === before, "prev unmutated");
  }

  // 10. regenerateThumbnail
  _step("10. regenerateThumbnail");
  if (manual) {
    const before = JSON.stringify(manual);
    const idx = manual.results.findIndex((s) => s.setKey === "emotional");
    const r = engine.regenerateThumbnail(manual, "emotional", { seedSalt: "test-10" });
    assert(r.ok === true, "ok=true");
    assert(r.response.regeneratedType === "thumbnail:emotional", "regeneratedType");
    const after = r.response.results[idx];
    const orig = manual.results[idx];
    assert(after.ytMusicTitle === orig.ytMusicTitle, "ytMusicTitle preserved");
    assert(after.ytPlaylistTitle === orig.ytPlaylistTitle, "ytPlaylistTitle preserved");
    assert(JSON.stringify(manual) === before, "prev unmutated");
  }

  // 11. regenerateTags
  _step("11. regenerateTags");
  if (manual) {
    const before = JSON.stringify(manual);
    const r = engine.regenerateTags(manual, "search", { seedSalt: "test-11" });
    assert(r.ok === true, "ok=true");
    assert(r.response.regeneratedType === "tags:search", "regeneratedType");
    assert(JSON.stringify(manual) === before, "prev unmutated");
  }

  // 12. favorites lifecycle
  _step("12. favorites lifecycle");
  if (manual) {
    const fId = manual.generationId;
    const add = engine.addFavorite({ id: fId, label: "self-check" });
    assert(add.ok === true && typeof add.total === "number", "add ok with total");
    assert(engine.hasFavorite(fId) === true, "has true");
    assert(engine.hasFavorite("nope") === false, "has missing false");
    const list = engine.listFavorites();
    assert(Array.isArray(list) && list.some((r) => r.id === fId), "list contains id");
    assert(engine.removeFavorite(fId) === true, "remove true");
    assert(engine.removeFavorite(fId) === false, "remove repeat false");
  }

  // 13. history list/detail/remove
  _step("13. history list/detail/remove");
  if (manual) {
    const list = engine.getHistory(20);
    assert(Array.isArray(list) && list.length >= 1, "list non-empty");
    const detail = engine.getHistoryDetail(manual.generationId);
    assert(detail && detail.id === manual.generationId, "detail id matches");
    assert(engine.removeHistory(manual.generationId) === true, "remove true");
    assert(engine.getHistoryDetail(manual.generationId) === null, "detail null after remove");
    assert(engine.removeHistory(manual.generationId) === false, "remove repeat false");
  }

  // 14. exports
  _step("14. exports JSON / CSV / TXT");
  if (manual) {
    const j = engine.exportJSON(manual);
    let parsed = null;
    try { parsed = JSON.parse(j); } catch (_) {}
    assert(parsed && parsed.generationId === manual.generationId, "JSON round-trip");

    const csv = engine.exportCSV(manual);
    const lines = csv.split("\r\n").filter(Boolean);
    assert(lines.length === 4, "CSV header + 3 rows", `got ${lines.length}`);
    assert(lines[0].split(",").length >= 18, "CSV header ≥ 18 columns");

    const txt = engine.exportTXT(manual);
    assert(txt.includes("SEO Creator"), "TXT title present");
    assert(txt.includes("감성형") || txt.includes("Emotional"), "TXT set label present");

    const fname = engine.suggestExportFilename(manual, "csv");
    assert(/^seo-creator-.+\.csv$/.test(fname), "filename pattern");
  }

  // 15. determinism
  _step("15. deterministic output for same input");
  const inputA = { genre: "edm", mood: "energetic", situation: "workout", language: "ko" };
  const a = engine.generateFromManual(inputA);
  const b = engine.generateFromManual(inputA);
  const sameTitles = a.results.every((s, i) =>
    s.ytMusicTitle === b.results[i].ytMusicTitle &&
    s.ytPlaylistTitle === b.results[i].ytPlaylistTitle);
  const sameThumbs = a.results.every((s, i) =>
    JSON.stringify(s.thumbnail) === JSON.stringify(b.results[i].thumbnail));
  assert(sameTitles, "same titles for same input");
  assert(sameThumbs, "same thumbnails for same input");
  assert(a.generationId !== b.generationId, "generationId still random");
  // 다른 입력 → 다른 결과
  const c = engine.generateFromManual({
    genre: "lofi", mood: "chill", situation: "study", language: "ko",
  });
  assert(c.results[0].ytMusicTitle !== a.results[0].ytMusicTitle,
    "different input → different titles");

  // 16. invalid input
  _step("16. invalid input handling");
  let threwM = false;
  let mErr = "";
  try { engine.generateFromManual({}); }
  catch (e) { threwM = true; mErr = e.message; }
  assert(threwM && /required/i.test(mErr), "missing fields throw 'required'");

  const r1 = engine.regenerateSet(null, "emotional");
  assert(r1 && r1.ok === false, "regenerateSet(null) → ok:false");
  const r2 = engine.regenerateSet({}, "emotional");
  assert(r2 && r2.ok === false, "regenerateSet({}) → ok:false");
  const r3 = engine.regenerateAll({ analysis: {}, results: [] });
  assert(r3 && r3.ok === false, "regenerateAll(empty results) → ok:false");

  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

  // summary
  console.log(`\n=========================================`);
  console.log(`  passed: ${_passed}`);
  console.log(`  failed: ${_failed}`);
  if (_failed > 0) {
    console.log(`\nFailures:`);
    for (const f of _failures) console.log(`  - ${f.label} :: ${f.reason}`);
    process.exit(1);
  }
  console.log(`  ALL PASS ✓ (${_passed} assertions)`);
}

main().catch((e) => {
  console.error("\n[fatal]", e && e.stack || e);
  process.exit(1);
});
