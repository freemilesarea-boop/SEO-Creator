/**
 * History Store
 *
 * 생성 결과를 userData/history/{id}.json 파일로 저장한다.
 *
 * 안정성:
 * - atomic write (tmp → rename)
 * - corruption recovery (.corrupt-<ts>로 격리, 빈 결과 반환)
 * - userData 미초기화 상태에서도 호출 안전 (no-op)
 *
 * 외부 컨트랙트:
 * - record는 최소 { id, inputType, createdAt, seoScore } 필드를 가짐
 * - save()는 record 객체 자체를 그대로 직렬화
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

let _historyDir = null;

function _safeMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {
    // EEXIST 무시
  }
}

function init(userDataPath) {
  if (!userDataPath || typeof userDataPath !== "string") return;
  const dir = path.join(userDataPath, "history");
  _safeMkdir(dir);
  _historyDir = dir;
}

function _isReady() {
  return _historyDir && fs.existsSync(_historyDir);
}

function _quarantineCorrupt(filePath, reason) {
  try {
    const stamp = Date.now();
    const dest = `${filePath}.corrupt-${stamp}`;
    fs.renameSync(filePath, dest);
    console.warn(`[history-store] quarantined corrupt file: ${path.basename(filePath)} → ${path.basename(dest)} (${reason})`);
  } catch (_) {
    // 격리 실패 시에도 진행 — 다음 read에서 같은 파일을 다시 시도하지 않도록 unlink
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

function _readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw || !raw.trim()) {
      _quarantineCorrupt(filePath, "empty");
      return null;
    }
    return JSON.parse(raw);
  } catch (e) {
    _quarantineCorrupt(filePath, e.message);
    return null;
  }
}

/**
 * Atomic write: tmp 파일에 쓰고 rename으로 교체.
 */
function _atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  _safeMkdir(dir);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, json, "utf-8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    // 일부 OS에서 cross-device 등으로 rename 실패 시 fallback
    try { fs.copyFileSync(tmp, filePath); fs.unlinkSync(tmp); }
    catch (_) { try { fs.unlinkSync(tmp); } catch (_) {} throw e; }
  }
}

/**
 * @param {object} record - 최소 { id } 필요
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
function save(record) {
  if (!_isReady()) return { ok: false, error: "history dir not initialized" };
  if (!record || typeof record !== "object" || !record.id) {
    return { ok: false, error: "invalid record (missing id)" };
  }
  const fileName = `${String(record.id).replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
  const filePath = path.join(_historyDir, fileName);
  try {
    _atomicWrite(filePath, record);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * @param {string} id
 * @returns {object|null}
 */
function get(id) {
  if (!_isReady() || !id) return null;
  const fileName = `${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
  const filePath = path.join(_historyDir, fileName);
  if (!fs.existsSync(filePath)) return null;
  return _readJsonSafe(filePath);
}

/**
 * @param {{limit?: number, offset?: number}} opts
 * @returns {Array<{id, inputType, seoScore, createdAt}>}
 */
function list(opts) {
  if (!_isReady()) return [];
  const limit = Math.max(1, Math.min(200, (opts && opts.limit) || 50));
  const offset = Math.max(0, (opts && opts.offset) || 0);
  let files;
  try {
    files = fs.readdirSync(_historyDir).filter((f) => f.endsWith(".json"));
  } catch (_) {
    return [];
  }
  // 파일명 기준 역순 (id에 timestamp나 uuid 포함이면 충분히 안정적), 동률 시 mtime fallback
  files.sort((a, b) => {
    if (a < b) return 1;
    if (a > b) return -1;
    return 0;
  });
  const sliced = files.slice(offset, offset + limit);
  const out = [];
  for (const f of sliced) {
    const data = _readJsonSafe(path.join(_historyDir, f));
    if (!data) continue;
    out.push({
      id: data.id || data.generationId || path.basename(f, ".json"),
      inputType: data.inputType || "unknown",
      seoScore: typeof data.seoScore === "number" ? data.seoScore : 0,
      createdAt: data.createdAt || null,
      label: data.label || null,
    });
  }
  // createdAt이 있으면 그 기준으로 한 번 더 정렬 (최신 우선)
  out.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
  return out;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function remove(id) {
  if (!_isReady() || !id) return false;
  const fileName = `${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
  const filePath = path.join(_historyDir, fileName);
  if (!fs.existsSync(filePath)) return false;
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

function _getDir() {
  return _historyDir;
}

module.exports = { init, save, get, list, remove, _getDir };
