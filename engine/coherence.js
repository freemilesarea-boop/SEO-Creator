/**
 * Semantic Coherence Layer
 *
 * situation을 기준으로 mood, visual, title의 일관성을 보장한다.
 * situation-first 구조: situation → compatible mood → compatible visuals
 */

// ---------------------------------------------------------------------------
// [2] Situation-Mood compatibility matrix
// ---------------------------------------------------------------------------

const SITUATION_MOOD_BOOST = {
  workout: new Set(["energetic", "intense", "happy"]),
  party: new Set(["energetic", "sexy", "happy", "intense"]),
  study: new Set(["chill", "peaceful", "dreamy"]),
  sleep: new Set(["peaceful", "dreamy", "chill"]),
  cafe: new Set(["chill", "romantic", "nostalgic", "peaceful"]),
  night_drive: new Set(["dark", "dreamy", "nostalgic", "emotional", "sexy"]),
  late_night: new Set(["dark", "dreamy", "lonely", "emotional", "cinematic"]),
  rain: new Set(["emotional", "nostalgic", "sad", "chill"]),
  morning: new Set(["peaceful", "happy"]),
  walk: new Set(["chill", "happy", "nostalgic", "peaceful"]),
  commute: new Set(["energetic", "happy", "chill"]),
  reading: new Set(["peaceful", "chill", "dreamy"]),
  cooking: new Set(["chill", "peaceful", "happy"]),
  breakup: new Set(["emotional", "sad", "lonely", "dark"]),
  sunset: new Set(["nostalgic", "dreamy", "romantic", "chill"]),
  travel: new Set(["happy", "energetic", "nostalgic", "dreamy"]),
};

const SITUATION_MOOD_PENALIZE = {
  workout: new Set(["emotional", "sad", "nostalgic", "dreamy", "peaceful", "lonely", "romantic"]),
  party: new Set(["sad", "lonely", "peaceful", "dreamy"]),
  study: new Set(["energetic", "intense", "sexy", "dark"]),
  sleep: new Set(["energetic", "intense", "sexy", "happy"]),
  cafe: new Set(["intense", "dark", "energetic"]),
  night_drive: new Set(["happy", "peaceful"]),
  late_night: new Set(["happy", "energetic"]),
  rain: new Set(["energetic", "happy", "sexy"]),
  morning: new Set(["dark", "intense", "sexy", "sad"]),
  walk: new Set(["intense", "dark", "sexy"]),
  commute: new Set(["sad", "lonely", "dark"]),
  reading: new Set(["energetic", "intense", "sexy"]),
  cooking: new Set(["dark", "intense", "sexy", "energetic", "sad", "lonely"]),
  breakup: new Set(["happy", "energetic"]),
  sunset: new Set(["intense", "energetic", "dark"]),
  travel: new Set(["sad", "lonely", "dark"]),
};

/**
 * situation과 가장 호환되는 mood를 detectedMoods에서 선택한다.
 * @param {string} situation
 * @param {string[]} detectedMoods
 * @returns {string}
 */
function pickCompatibleMood(situation, detectedMoods) {
  if (!detectedMoods || detectedMoods.length === 0) {
    const boosts = SITUATION_MOOD_BOOST[situation];
    if (boosts && boosts.size > 0) {
      return boosts.values().next().value;
    }
    return "chill";
  }

  const boostSet = SITUATION_MOOD_BOOST[situation] || new Set();
  const penaltySet = SITUATION_MOOD_PENALIZE[situation] || new Set();

  const scored = detectedMoods.map((mood, i) => {
    let score = -i;
    if (boostSet.has(mood)) {
      score += 5;
    }
    if (penaltySet.has(mood)) {
      score -= 6;
    }
    return { mood, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].mood;
}

/**
 * situation과 호환되는 mood만 최대 maxCount개 반환.
 * @param {string} situation
 * @param {string[]} detectedMoods
 * @param {number} [maxCount=2]
 * @returns {string[]}
 */
function filterCompatibleMoods(situation, detectedMoods, maxCount = 2) {
  const boostSet = SITUATION_MOOD_BOOST[situation] || new Set();
  const penaltySet = SITUATION_MOOD_PENALIZE[situation] || new Set();

  const scored = detectedMoods.map((mood, i) => {
    let score = -i;
    if (boostSet.has(mood)) {
      score += 5;
    }
    if (penaltySet.has(mood)) {
      score -= 6;
    }
    return { mood, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored
    .slice(0, maxCount)
    .filter((item) => item.score > -5)
    .map((item) => item.mood);
}

// ---------------------------------------------------------------------------
// [3] Situation-Visual compatibility matrix
// ---------------------------------------------------------------------------

const SITUATION_VISUAL_BOOST = {
  workout: new Set(["gym", "running", "dumbbell", "sweat", "boxing", "shoes", "motion", "energy", "neon gym", "powerful"]),
  party: new Set(["club", "disco", "crowd", "dj", "strobe", "dance", "neon", "champagne", "laser", "night"]),
  study: new Set(["desk", "lamp", "book", "library", "notebook", "laptop", "minimalist", "pen", "focus"]),
  sleep: new Set(["moon", "star", "bedroom", "pillow", "night light", "cloud", "crescent", "dim"]),
  cafe: new Set(["coffee", "latte", "cafe", "bookshelf", "warm", "croissant", "wood", "window seat"]),
  night_drive: new Set(["highway", "dashboard", "car", "tunnel", "city", "neon", "rearview", "road"]),
  late_night: new Set(["city", "midnight", "neon", "moon", "rooftop", "alley", "desk", "dim"]),
  rain: new Set(["rain", "umbrella", "puddle", "fog", "window", "droplet", "wet", "mist"]),
  morning: new Set(["sunrise", "coffee", "alarm", "golden hour", "dew", "fresh", "curtain"]),
  walk: new Set(["path", "park", "leaves", "sky", "bridge", "street", "sunshine"]),
  commute: new Set(["train", "subway", "headphones", "bus", "city", "morning", "rush"]),
  breakup: new Set(["torn", "empty", "wilted", "rain", "fade", "letter", "alone"]),
  sunset: new Set(["sunset", "ocean", "golden", "horizon", "silhouette", "sky", "beach"]),
  travel: new Set(["airplane", "map", "road", "mountain", "train", "backpack", "scenery"]),
};

const SITUATION_VISUAL_BLOCK = {
  workout: new Set([
    "rain on window", "handwritten diary", "empty street at night", "old photograph",
    "lonely bedroom", "candle", "falling petals", "wilted flower", "torn photo",
    "empty bench", "rainy window", "handwritten letter", "single candle",
    "rain at bus stop", "fading footprints", "empty chair",
  ]),
  party: new Set([
    "pillow", "moon", "bedroom", "study", "desk", "lamp", "book", "library",
    "candle", "empty bench", "lonely", "diary", "letter",
  ]),
  study: new Set([
    "club", "disco", "dj", "dance floor", "crowd", "champagne", "strobe",
    "gym", "dumbbell", "boxing",
  ]),
  sleep: new Set([
    "gym", "running", "club", "party", "dj", "crowd", "workout", "boxing",
    "strobe", "dance floor",
  ]),
  morning: new Set([
    "club", "disco", "dj", "neon alley", "midnight", "dark alley",
    "abandoned building", "cracked mirror",
  ]),
  cooking: new Set([
    "gym", "club", "highway", "midnight", "neon alley", "dark alley",
    "thunderstorm", "abandoned building",
  ]),
};

/**
 * situation과 호환되는 visual만 필터링. 부적합한 것은 제거.
 * @param {string} situation
 * @param {string[]} visuals
 * @returns {string[]}
 */
function filterVisualsForSituation(situation, visuals) {
  const blockSet = SITUATION_VISUAL_BLOCK[situation] || new Set();
  const boostSet = SITUATION_VISUAL_BOOST[situation] || new Set();

  const filtered = [];
  for (const v of visuals) {
    const vLower = v.toLowerCase();
    let blocked = false;
    for (const blockKw of blockSet) {
      if (vLower.includes(blockKw.toLowerCase())) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      filtered.push(v);
    }
  }

  // boost 키워드가 포함된 항목을 앞으로
  filtered.sort((a, b) => {
    const scoreA = _boostScore(a, boostSet);
    const scoreB = _boostScore(b, boostSet);
    return scoreA - scoreB;
  });

  return filtered;
}

function _boostScore(visual, boostSet) {
  const vLower = visual.toLowerCase();
  let score = 0;
  for (const bk of boostSet) {
    if (vLower.includes(bk.toLowerCase())) {
      score += 1;
    }
  }
  return -score; // 낮을수록 앞으로
}

/**
 * situation에 맞는 기본 visual 후보를 반환.
 * @param {string} situation
 * @returns {string[]}
 */
function getSituationVisuals(situation) {
  const defaults = {
    workout: ["neon gym interior", "running shoes on road", "motion blur athlete", "dumbbell closeup", "boxing gloves"],
    party: ["disco ball reflections", "crowd with hands up", "DJ booth neon", "club dance floor", "champagne toast"],
    study: ["desk lamp and books", "library aisle", "minimalist desk setup", "notebook and pen", "laptop focus"],
    sleep: ["moonlit bedroom", "stars through window", "soft pillow close", "dim night light", "crescent moon"],
    cafe: ["latte art closeup", "cafe window seat", "warm wood interior", "bookshelf cafe", "coffee steam"],
    night_drive: ["highway lights streaking", "dashboard glow", "city skyline from car", "tunnel lights", "neon road"],
    late_night: ["city skyline midnight", "neon alley", "moon over rooftop", "dimly lit desk", "empty highway"],
    rain: ["raindrops on glass", "umbrella in rain", "foggy street", "puddle reflection", "rainy window"],
    morning: ["sunrise through window", "morning coffee pour", "golden hour bedroom", "dew on grass", "fresh air"],
    walk: ["tree-lined path", "park bench", "autumn leaves", "open sky", "quiet street"],
    commute: ["subway headphones", "train window scenery", "morning city street", "bus ride view", "rush hour crowd"],
    breakup: ["torn photograph", "empty park bench", "wilted flower", "rain at window", "fading footprints"],
    sunset: ["ocean sunset", "rooftop skyline dusk", "golden light silhouette", "beach bonfire", "orange sky"],
    travel: ["airplane window clouds", "open highway", "mountain backpacker", "train window scenery", "world map"],
  };
  return defaults[situation] || ["headphones on table", "vinyl record", "music notes"];
}

// ---------------------------------------------------------------------------
// [4] Title consistency check
// ---------------------------------------------------------------------------

const TITLE_CONFLICT_WORDS = {
  workout: new Set([
    "슬픈", "감성", "이별", "비 오는", "외로운", "쓸쓸", "눈물", "잠잘", "수면",
    "sad", "lonely", "rainy", "breakup", "tearful", "lullaby", "sleep", "diary",
  ]),
  party: new Set([
    "잔잔한", "수면", "잠잘", "공부", "집중", "조용한",
    "calm", "sleep", "study", "lullaby", "focus", "quiet",
  ]),
  study: new Set([
    "파티", "클럽", "신나는", "파워풀", "댄스",
    "party", "club", "dance", "hype", "turn up",
  ]),
  sleep: new Set([
    "운동", "헬스", "파티", "클럽", "파워풀", "강렬",
    "workout", "gym", "party", "club", "intense", "pump",
  ]),
  morning: new Set([
    "새벽", "심야", "클럽", "어두운",
    "midnight", "late night", "club", "dark",
  ]),
};

/**
 * 제목이 situation과 의미적으로 충돌하지 않는지 확인.
 * @param {string} situation
 * @param {string} title
 * @returns {boolean}
 */
function isTitleConsistent(situation, title) {
  const conflictWords = TITLE_CONFLICT_WORDS[situation] || new Set();
  const titleLower = title.toLowerCase();
  for (const cw of conflictWords) {
    if (titleLower.includes(cw.toLowerCase())) {
      return false;
    }
  }
  return true;
}

module.exports = {
  SITUATION_MOOD_BOOST,
  SITUATION_MOOD_PENALIZE,
  SITUATION_VISUAL_BOOST,
  SITUATION_VISUAL_BLOCK,
  TITLE_CONFLICT_WORDS,
  pickCompatibleMood,
  filterCompatibleMoods,
  filterVisualsForSituation,
  getSituationVisuals,
  isTitleConsistent,
};
