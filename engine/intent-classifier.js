/**
 * Intent Classifier - 키워드 검색 의도 분류
 *
 * 4가지 intent:
 * - discovery: 탐색형 (추천, 모음, best, top)
 * - utility: 실용형 (운동할 때, 공부할 때, ~용)
 * - mood: 감성형 (감성, 몽환, chill, emotional)
 * - creator: 크리에이터형 (playlist, bgm, vlog, 플레이리스트)
 */

// ── Intent 패턴 매칭 ──

const DISCOVERY_PATTERNS = new Set([
  "추천", "모음", "best", "top", "인기", "신곡", "히트", "히트곡",
  "명곡", "베스트", "songs", "hits", "trending", "chart", "popular",
  "2024", "2025", "new", "latest", "신규", "최신",
]);

const UTILITY_PATTERNS = new Set([
  "할 때", "할때", "하면서", "에서 듣", "듣기 좋은", "들으면",
  "배경음악", "배경", "운동용", "공부용", "수면용",
  "for", "while", "during", "at the", "to study", "to sleep",
  "to work", "for gym", "for running",
]);

const MOOD_PATTERNS = new Set([
  "감성", "감동", "몽환", "슬픈", "외로운", "설레는", "따뜻한",
  "차분한", "편안한", "신나는", "에너지", "로맨틱",
  "chill", "emotional", "dreamy", "sad", "lonely", "romantic",
  "vibes", "mood", "feel", "aesthetic", "vibe",
]);

const CREATOR_PATTERNS = new Set([
  "플레이리스트", "플리", "bgm", "brm", "vlog", "브이로그",
  "playlist", "mix", "compilation", "collection", "radio",
  "리스트", "셀렉션", "큐레이션",
]);

// ── Situation → 선호 intent 매핑 ──

const SITUATION_PREFERRED_INTENT = {
  workout: ["utility", "discovery"],
  study: ["utility", "creator"],
  sleep: ["utility", "mood"],
  cafe: ["mood", "creator"],
  night_drive: ["mood", "utility"],
  late_night: ["mood", "utility"],
  rain: ["mood", "discovery"],
  morning: ["utility", "mood"],
  party: ["discovery", "utility"],
  walk: ["mood", "discovery"],
  commute: ["utility", "discovery"],
  reading: ["mood", "creator"],
  breakup: ["mood", "discovery"],
  sunset: ["mood", "creator"],
  travel: ["discovery", "utility"],
  cooking: ["utility", "creator"],
};

// ── Intent 충돌 규칙 ──

const INTENT_CONFLICT = {
  workout: { mood: -0.08 },
  study: { mood: -0.04 },
  sleep: { discovery: -0.04 },
  party: { mood: -0.06 },
  morning: { mood: -0.03 },
};

/**
 * 키워드의 검색 의도를 분류한다.
 * @param {string} keyword
 * @returns {string}
 */
function classifyIntent(keyword) {
  const low = keyword.toLowerCase();

  const scores = { discovery: 0, utility: 0, mood: 0, creator: 0 };

  for (const p of UTILITY_PATTERNS) {
    if (low.includes(p)) {
      scores.utility += 2;
    }
  }
  for (const p of MOOD_PATTERNS) {
    if (low.includes(p)) {
      scores.mood += 2;
    }
  }
  for (const p of DISCOVERY_PATTERNS) {
    if (low.includes(p)) {
      scores.discovery += 2;
    }
  }
  for (const p of CREATOR_PATTERNS) {
    if (low.includes(p)) {
      scores.creator += 2;
    }
  }

  // 가장 높은 intent 반환 (동점 시 우선순위: utility > discovery > mood > creator)
  const priority = ["utility", "discovery", "mood", "creator"];
  let best = "discovery";
  let bestVal = -Infinity;

  for (const k of priority) {
    // Higher score wins; among ties, earlier in priority array wins
    // Python used: max(scores, key=lambda k: (scores[k], -priority.index(k)))
    // We replicate by iterating in priority order and using >=
    const val = scores[k];
    if (val > bestVal) {
      bestVal = val;
      best = k;
    }
  }

  if (bestVal === 0) {
    // 패턴 매칭 없으면 길이 기반 추정
    const words = keyword.split(/\s+/).filter(Boolean);
    if (words.length >= 5) {
      return "utility";
    }
    return "discovery";
  }

  return best;
}

/**
 * 키워드의 intent가 situation과 얼마나 맞는지 0~1 점수.
 * @param {string} keyword
 * @param {string} situation
 * @returns {number}
 */
function intentMatchScore(keyword, situation) {
  const intent = classifyIntent(keyword);
  const preferred = SITUATION_PREFERRED_INTENT[situation] || ["discovery", "utility"];

  let score;
  if (intent === preferred[0]) {
    score = 1.0;
  } else if (preferred.includes(intent)) {
    score = 0.7;
  } else {
    score = 0.3;
  }

  // 충돌 패널티
  const conflicts = INTENT_CONFLICT[situation] || {};
  const penalty = conflicts[intent] || 0.0;
  score += penalty;

  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * 특정 intent에 해당하는 키워드만 필터링.
 * @param {Array<[string, number]>} keywordsWithScores - [[keyword, score], ...]
 * @param {string[]} targetIntents
 * @param {number} [count=5]
 * @returns {Array<[string, number]>}
 */
function filterByIntent(keywordsWithScores, targetIntents, count = 5) {
  const filtered = keywordsWithScores.filter(([kw]) =>
    targetIntents.includes(classifyIntent(kw))
  );
  filtered.sort((a, b) => b[1] - a[1]);
  return filtered.slice(0, count);
}

module.exports = {
  DISCOVERY_PATTERNS,
  UTILITY_PATTERNS,
  MOOD_PATTERNS,
  CREATOR_PATTERNS,
  SITUATION_PREFERRED_INTENT,
  INTENT_CONFLICT,
  classifyIntent,
  intentMatchScore,
  filterByIntent,
};
