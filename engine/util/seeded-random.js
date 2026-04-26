/**
 * Deterministic seeded RNG (mulberry32) and a stable hash helper.
 *
 * 같은 입력은 같은 결과를 반환하도록 generation 단계 전반에서 사용한다.
 */

"use strict";

const crypto = require("crypto");

/**
 * 32-bit non-negative integer hash for an arbitrary input value.
 * @param {*} value any JSON-serializable
 * @returns {number} 0..2^32-1
 */
function hashSeed(value) {
  let str;
  if (typeof value === "string") {
    str = value;
  } else {
    try {
      str = JSON.stringify(value);
    } catch (_) {
      str = String(value);
    }
  }
  const buf = crypto.createHash("sha1").update(str).digest();
  // first 4 bytes → uint32
  return buf.readUInt32BE(0) >>> 0;
}

/**
 * mulberry32 PRNG. Returns a function () => float in [0,1).
 * @param {number} seed uint32
 */
function makeRng(seed) {
  let t = seed >>> 0;
  return function rng() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick one element deterministically from an array using rng().
 */
function pickOne(rng, arr) {
  if (!arr || !arr.length) return undefined;
  const i = Math.floor(rng() * arr.length);
  return arr[Math.min(i, arr.length - 1)];
}

/**
 * Shuffle a copy of `arr` deterministically.
 */
function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { hashSeed, makeRng, pickOne, shuffle };
