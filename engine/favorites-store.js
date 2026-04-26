/**
 * Favorites Store
 *
 * userData/favorites.json 단일 파일에 즐겨찾기 목록을 보관한다.
 *
 * 안정성:
 * - atomic write (tmp → rename)
 * - 파일 손상 시 .corrupt-<ts>로 격리하고 빈 목록으로 복구
 *
 * 외부 컨트랙트:
 * - record는 최소 { id } 필드를 가진다.
 * - 같은 id로 add() 시 갱신 (덮어쓰기)
 */

"use strict";

const fs = require("fs");
const path = require("path");

let _filePath = null;
let _cache = null;

const MAX_FAVORITES = 500;

function _safeMkdir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function _atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  _safeMkdir(dir);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.copyFileSync(tmp, filePath); fs.unlinkSync(tmp); }
    catch (_) { try { fs.unlinkSync(tmp); } catch (_) {} throw e; }
  }
}

function _quarantine(filePath, reason) {
  try {
    const dest = `${filePath}.corrupt-${Date.now()}`;
    fs.renameSync(filePath, dest);
    console.warn(`[favorites-store] quarantined: ${path.basename(dest)} (${reason})`);
  } catch (_) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

function _load() {
  if (!_filePath) return [];
  if (_cache) return _cache;
  if (!fs.existsSync(_filePath)) {
    _cache = [];
    return _cache;
  }
  try {
    const raw = fs.readFileSync(_filePath, "utf-8");
    const parsed = raw && raw.trim() ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      _quarantine(_filePath, "not an array");
      _cache = [];
    } else {
      _cache = parsed;
    }
  } catch (e) {
    _quarantine(_filePath, e.message);
    _cache = [];
  }
  return _cache;
}

function _flush() {
  if (!_filePath || !_cache) return;
  try {
    _atomicWrite(_filePath, _cache);
  } catch (e) {
    console.warn(`[favorites-store] flush failed: ${e.message}`);
  }
}

// ── 공개 API ──

function init(userDataPath) {
  if (!userDataPath || typeof userDataPath !== "string") {
    _filePath = null;
    _cache = null;
    return;
  }
  _safeMkdir(userDataPath);
  _filePath = path.join(userDataPath, "favorites.json");
  _cache = null; // 다음 _load()에서 새로 읽도록
  _load();
}

function _isReady() {
  return !!_filePath;
}

/**
 * @param {object} record - 최소 { id } 필요
 * @returns {{ ok: boolean, total?: number, error?: string }}
 */
function add(record) {
  if (!_isReady()) return { ok: false, error: "favorites not initialized" };
  if (!record || typeof record !== "object" || !record.id) {
    return { ok: false, error: "invalid record (missing id)" };
  }
  const list = _load();
  const idx = list.findIndex((r) => r.id === record.id);
  const item = { ...record, favoritedAt: new Date().toISOString() };
  if (idx >= 0) {
    list[idx] = item;
  } else {
    list.unshift(item);
  }
  if (list.length > MAX_FAVORITES) list.length = MAX_FAVORITES;
  _flush();
  return { ok: true, total: list.length };
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function remove(id) {
  if (!_isReady() || !id) return false;
  const list = _load();
  const before = list.length;
  _cache = list.filter((r) => r.id !== id);
  if (_cache.length === before) return false;
  _flush();
  return true;
}

function has(id) {
  if (!_isReady() || !id) return false;
  return _load().some((r) => r.id === id);
}

function list() {
  if (!_isReady()) return [];
  return _load().slice();
}

function clear() {
  if (!_isReady()) return;
  _cache = [];
  _flush();
}

function _getFilePath() {
  return _filePath;
}

module.exports = { init, add, remove, has, list, clear, _getFilePath, MAX_FAVORITES };
