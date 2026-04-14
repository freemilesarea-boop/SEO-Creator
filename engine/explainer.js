/**
 * Title Explanation Generator
 *
 * 각 제목에 대해 왜 이 키워드가 선택됐는지,
 * 어떤 SEO 요소가 반영됐는지 설명을 생성한다.
 */

const {
  classifyKeyword,
  specificityScore,
  hasGenreAnchor,
  genreAnchorScore,
  competitionScore,
} = require("./keyword-engine");
const { classifyIntent } = require("./intent-classifier");

// ── Marker dictionaries ──

const SITUATION_MARKERS = {
  "헬스장에서": "low competition context",
  "러닝할 때": "low competition context",
  "운동할 때": "utility context",
  "운동할때": "utility context",
  "공부할 때": "utility context",
  "카페에서": "low competition context",
  "커피숍에서": "low competition context",
  "새벽에": "time-specific context",
  "밤에": "time-specific context",
  "잠잘 때": "utility context",
  "비 오는 날": "weather context",
  "드라이브할 때": "activity context",
  "밤 드라이브": "specific situation",
  "야간 드라이브": "specific situation",
  "출퇴근할 때": "utility context",
  "산책할 때": "activity context",
  "at the gym": "low competition context",
  "while running": "low competition context",
  "for workout": "utility context",
  "late night": "time-specific context",
  "at a coffee shop": "low competition context",
};

const GENRE_MARKERS = {
  "케이팝": "genre anchor",
  "kpop": "genre anchor",
  "K-POP": "genre anchor",
  "팝": "genre anchor",
  "pop": "genre anchor",
  "알앤비": "genre anchor",
  "rnb": "genre anchor",
  "로파이": "genre anchor",
  "lofi": "genre anchor",
  "힙합": "genre anchor",
  "재즈": "genre anchor",
  "발라드": "genre anchor",
  "인디": "genre anchor",
  "록": "genre anchor",
  "클래식": "genre anchor",
  "어쿠스틱": "genre anchor",
  "시티팝": "genre anchor",
};

const CTR_MARKERS = {
  "에너지 넘치는": "CTR booster (energy modifier)",
  "신나는": "CTR booster (excitement modifier)",
  "텐션 올라가는": "CTR booster (hype modifier)",
  "분위기 미치는": "CTR booster (vibe modifier)",
  "감성": "CTR booster (emotional hook)",
  "감성적인": "CTR booster (emotional hook)",
  "차분한": "CTR booster (calm modifier)",
  "섹시한": "CTR booster (allure modifier)",
  "몽환": "CTR booster (dreamy modifier)",
  "잔잔한": "CTR booster (soft modifier)",
  "파워풀": "CTR booster (power modifier)",
  "듣기 좋은": "utility signal (user intent match)",
  "틀기 좋은": "utility signal (user intent match)",
  "듣는": "utility signal",
  "energetic": "CTR booster",
  "chill": "CTR booster",
  "emotional": "CTR booster",
  "dreamy": "CTR booster",
};

const SEO_MARKERS = {
  "플레이리스트": "SEO signal (playlist keyword)",
  "playlist": "SEO signal (playlist keyword)",
  "모음": "SEO signal (collection keyword)",
  "추천": "SEO signal (recommendation keyword)",
  "bgm": "SEO signal (creator keyword)",
  "mix": "SEO signal (mix keyword)",
  "2025": "SEO signal (recency)",
  "2024": "SEO signal (recency)",
  "신곡": "SEO signal (freshness)",
  "히트곡": "SEO signal (popularity)",
};

/**
 * 제목의 각 구성 요소를 분석한다.
 * @param {string} title
 * @returns {Array<{text: string, reason: string, type: string}>}
 */
function _analyzeFragments(title) {
  const fragments = [];
  const titleLower = title.toLowerCase();

  for (const [marker, reason] of Object.entries(SITUATION_MARKERS)) {
    if (title.includes(marker) || titleLower.includes(marker.toLowerCase())) {
      fragments.push({ text: marker, reason, type: "situation" });
    }
  }

  for (const [marker, reason] of Object.entries(GENRE_MARKERS)) {
    if (title.includes(marker) || titleLower.includes(marker.toLowerCase())) {
      fragments.push({ text: marker, reason, type: "genre" });
      break; // 장르는 1개만
    }
  }

  for (const [marker, reason] of Object.entries(CTR_MARKERS)) {
    if (title.includes(marker) || titleLower.includes(marker.toLowerCase())) {
      fragments.push({ text: marker, reason, type: "ctr" });
    }
  }

  for (const [marker, reason] of Object.entries(SEO_MARKERS)) {
    if (title.includes(marker) || titleLower.includes(marker.toLowerCase())) {
      fragments.push({ text: marker, reason, type: "seo" });
    }
  }

  // 중복 제거
  const seen = new Set();
  const unique = [];
  for (const f of fragments) {
    if (!seen.has(f.text)) {
      seen.add(f.text);
      unique.push(f);
    }
  }

  return unique;
}

/**
 * 제목에 대한 SEO 설명을 생성한다.
 * @param {string} title
 * @param {string} setType
 * @returns {{title: string, keywordType: string, intent: string, competition: string, fragments: Array, summary: string}}
 */
function explainTitle(title, setType) {
  if (!title) {
    return {
      title: "",
      keywordType: "",
      intent: "",
      competition: "",
      fragments: [],
      summary: "",
    };
  }

  const kwType = classifyKeyword(title);
  const intent = classifyIntent(title);
  const comp = competitionScore(title);
  const fragments = _analyzeFragments(title);
  const ga = genreAnchorScore(title);
  const { score: spec, dimensions: dims } = specificityScore(title);

  // competition label
  let compLabel;
  if (comp <= 0.3) {
    compLabel = "low";
  } else if (comp <= 0.6) {
    compLabel = "medium";
  } else {
    compLabel = "high";
  }

  // summary 생성
  const parts = [];

  // set type 설명
  const setDescriptions = {
    "감성형": "분위기/감성 키워드 중심 제목",
    "검색형": "검색량 기반 mid-tail 키워드 제목",
    "롱테일형": "경쟁도 낮은 구체적 long-tail 제목",
    "Emotional": "mood-focused emotional title",
    "Search-Optimized": "search volume mid-tail title",
    "Long-Tail": "low competition specific long-tail title",
  };
  if (setDescriptions[setType]) {
    parts.push(setDescriptions[setType]);
  }

  // 핵심 요소 설명
  const genreFrags = fragments.filter((f) => f.type === "genre");
  const sitFrags = fragments.filter((f) => f.type === "situation");
  const ctrFrags = fragments.filter((f) => f.type === "ctr");
  const seoFrags = fragments.filter((f) => f.type === "seo");

  if (genreFrags.length > 0) {
    parts.push(`장르 앵커: ${genreFrags[0].text}`);
  }
  if (sitFrags.length > 0) {
    parts.push(`상황 특정: ${sitFrags[0].text} (${compLabel} competition)`);
  }
  if (ctrFrags.length > 0) {
    parts.push(`CTR 요소: ${ctrFrags[0].text}`);
  }
  if (seoFrags.length > 0) {
    const seoNames = seoFrags.slice(0, 2).map((f) => f.text);
    parts.push(`SEO 신호: ${seoNames.join(", ")}`);
  }

  if (dims >= 3) {
    parts.push(`구체성 ${dims}차원 (높음)`);
  } else if (dims >= 2) {
    parts.push(`구체성 ${dims}차원 (적정)`);
  }

  const summary = parts.join(" | ");

  return {
    title,
    keywordType: kwType,
    intent,
    competition: compLabel,
    fragments,
    summary,
  };
}

/**
 * 결과 세트의 두 제목에 대한 설명을 생성한다.
 * @param {string} ytMusicTitle
 * @param {string} ytPlaylistTitle
 * @param {string} setLabel
 * @returns {{ytMusicExplanation: object, ytPlaylistExplanation: object}}
 */
function explainResultSet(ytMusicTitle, ytPlaylistTitle, setLabel) {
  return {
    ytMusicExplanation: explainTitle(ytMusicTitle, setLabel),
    ytPlaylistExplanation: explainTitle(ytPlaylistTitle, setLabel),
  };
}

module.exports = {
  SITUATION_MARKERS,
  GENRE_MARKERS,
  CTR_MARKERS,
  SEO_MARKERS,
  explainTitle,
  explainResultSet,
};
