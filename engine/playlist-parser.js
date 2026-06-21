/**
 * Playlist Parser (Node.js)
 *
 * YouTube / YouTube Music 재생목록에서 곡 정보를 추출한다.
 * yt-dlp 불필요 — HTTPS로 YouTube 페이지/Innertube API를 직접 호출.
 *
 * 동작 순서:
 *   1. 재생목록 HTML(/playlist?list=...)을 받아 ytInitialData + ytcfg(API key,
 *      client version, visitorData)를 추출한다.
 *   2. ytInitialData 에서 곡 목록을 파싱한다.
 *   3. 100곡이 넘어 continuation 토큰이 남아 있으면 Innertube browse API로
 *      이어서 가져온다.
 *   4. (HTML 파싱이 실패한 경우) ytcfg 로 얻은 키/버전으로 Innertube browse API를
 *      직접 호출하는 fallback 을 시도한다.
 *
 * YouTube Music URL(music.youtube.com)도 동일한 list ID 를 쓰므로
 * www.youtube.com/playlist 로 정규화하여 처리한다.
 */

const https = require("https");
const { URL } = require("url");

const YT_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "www.music.youtube.com",
]);

// 일반적인 데스크톱 Chrome User-Agent (YouTube 의 봇 차단/consent 우회에 필요)
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// EU/consent 인터스티셜을 건너뛰기 위한 쿠키
const CONSENT_COOKIE = "CONSENT=YES+1; SOCS=CAI";

// ytcfg 추출 실패 시 사용하는 공개 WEB 클라이언트 키 (yt-dlp 등과 동일)
const FALLBACK_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const FALLBACK_CLIENT_VERSION = "2.20240620.05.00";

function validatePlaylistUrl(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (!YT_HOSTS.has(u.hostname)) return null;
    const listId = u.searchParams.get("list");
    if (!listId || !/^[A-Za-z0-9_-]+$/.test(listId)) return null;
    return listId;
  } catch {
    return null;
  }
}

function _parseArtistTitle(raw) {
  for (const sep of [" - ", " – ", " — ", " | "]) {
    if (raw.includes(sep)) {
      const [a, ...rest] = raw.split(sep);
      const artist = a.trim();
      const title = rest.join(sep).trim();
      if (artist && title) return { artist, title };
    }
  }
  return { artist: "Unknown", title: raw.trim() };
}

// ── HTTPS 헬퍼 ──

function _httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      // 리다이렉트(consent 등) 처리
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(_httpsGet(next, headers));
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

function _httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.write(payload);
    req.end();
  });
}

// ── JSON 추출 헬퍼 ──

/**
 * HTML 안에서 `marker` 바로 뒤에 오는 JSON 객체를 중괄호 균형을 맞춰 추출한다.
 * 정규식 `\{.+?\}` 방식은 중첩/문자열 내부 중괄호 때문에 깨지므로
 * 문자열/이스케이프를 인식하는 brace-matching 으로 안전하게 잘라낸다.
 */
function _extractJsonAfter(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;

  let i = html.indexOf("{", start);
  if (i === -1) return null;

  const begin = i;
  let depth = 0;
  let inStr = false;
  let escape = false;

  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = html.slice(begin, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function _extractYtInitialData(html) {
  for (const marker of [
    "var ytInitialData =",
    'window["ytInitialData"] =',
    "ytInitialData =",
  ]) {
    const obj = _extractJsonAfter(html, marker);
    if (obj) return obj;
  }
  return null;
}

function _extractYtcfg(html) {
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
  const verMatch = html.match(/"INNERTUBE_CLIENT_VERSION":\s*"([^"]+)"/);
  const visitorMatch = html.match(/"VISITOR_DATA":\s*"([^"]+)"/);
  return {
    apiKey: apiKeyMatch ? apiKeyMatch[1] : FALLBACK_API_KEY,
    clientVersion: verMatch ? verMatch[1] : FALLBACK_CLIENT_VERSION,
    visitorData: visitorMatch ? visitorMatch[1] : null,
  };
}

// ── 곡 추출 ──

/**
 * 임의 깊이의 응답 객체에서 모든 playlistVideoRenderer 와
 * continuation 토큰을 재귀적으로 수집한다.
 * (YouTube 의 응답 구조가 자주 바뀌므로 고정 경로 대신 재귀 탐색을 사용한다.)
 */
function _collectFromTree(root) {
  const videos = [];
  let continuation = null;

  // 재생목록 순서를 보존하기 위해 깊이우선·문서순으로 순회한다.
  function walk(node) {
    if (!node || typeof node !== "object") return;

    if (node.playlistVideoRenderer) {
      videos.push(node.playlistVideoRenderer);
    }
    if (
      node.continuationItemRenderer &&
      node.continuationItemRenderer.continuationEndpoint
    ) {
      const token =
        node.continuationItemRenderer.continuationEndpoint
          .continuationCommand &&
        node.continuationItemRenderer.continuationEndpoint.continuationCommand
          .token;
      if (token) continuation = token;
    }

    if (Array.isArray(node)) {
      for (const v of node) walk(v);
    } else {
      for (const k in node) {
        const v = node[k];
        if (v && typeof v === "object") walk(v);
      }
    }
  }

  walk(root);
  return { videos, continuation };
}

function _videoToTrack(video) {
  const rawTitle =
    (video.title &&
      (video.title.runs
        ? video.title.runs.map((r) => r.text).join("")
        : video.title.simpleText)) ||
    "Unknown";

  // 자막/삭제된 영상 등 제목이 비어있으면 건너뛴다
  if (!rawTitle || rawTitle === "Unknown" || rawTitle === "[Private video]" ||
      rawTitle === "[Deleted video]") {
    if (rawTitle === "[Private video]" || rawTitle === "[Deleted video]") return null;
  }

  const channelName =
    (video.shortBylineText &&
      video.shortBylineText.runs &&
      video.shortBylineText.runs.map((r) => r.text).join("")) ||
    (video.longBylineText &&
      video.longBylineText.runs &&
      video.longBylineText.runs.map((r) => r.text).join("")) ||
    "";

  const lengthSeconds =
    parseInt(video.lengthSeconds || "0", 10) ||
    (video.lengthText &&
      _durationTextToSeconds(
        video.lengthText.simpleText ||
          (video.lengthText.runs &&
            video.lengthText.runs.map((r) => r.text).join("")),
      )) ||
    null;

  let artist, title;
  if (channelName && channelName !== rawTitle) {
    artist = channelName;
    title = rawTitle;
  } else {
    ({ artist, title } = _parseArtistTitle(rawTitle));
  }

  // " - Topic" 제거 (YouTube Music 아티스트 채널)
  artist = artist.replace(/\s*-\s*Topic$/i, "").trim();

  return { title, artist, durationSeconds: lengthSeconds || null };
}

function _durationTextToSeconds(text) {
  if (!text) return null;
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function _extractPlaylistTitle(data, listId) {
  return (
    (data.metadata &&
      data.metadata.playlistMetadataRenderer &&
      data.metadata.playlistMetadataRenderer.title) ||
    (data.header &&
      data.header.playlistHeaderRenderer &&
      data.header.playlistHeaderRenderer.title &&
      (data.header.playlistHeaderRenderer.title.simpleText ||
        (data.header.playlistHeaderRenderer.title.runs &&
          data.header.playlistHeaderRenderer.title.runs
            .map((r) => r.text)
            .join("")))) ||
    `Playlist ${listId}`
  );
}

// ── Innertube continuation ──

async function _fetchContinuation(token, cfg) {
  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: cfg.clientVersion,
        hl: "ko",
        gl: "KR",
        ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {}),
      },
    },
    continuation: token,
  };

  const { status, data } = await _httpsPost(
    `https://www.youtube.com/youtubei/v1/browse?key=${cfg.apiKey}&prettyPrint=false`,
    body,
    {
      "User-Agent": UA,
      Origin: "https://www.youtube.com",
      Referer: "https://www.youtube.com/",
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": cfg.clientVersion,
      ...(cfg.visitorData ? { "X-Goog-Visitor-Id": cfg.visitorData } : {}),
    },
  );

  if (status !== 200) throw new Error(`Innertube continuation returned ${status}`);
  return JSON.parse(data);
}

// ── 방법 1: HTML(ytInitialData) 파싱 + continuation ──

async function _parseFromHtml(listId) {
  const url = `https://www.youtube.com/playlist?list=${listId}&hl=ko`;
  const { status, data } = await _httpsGet(url, {
    "User-Agent": UA,
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    Cookie: CONSENT_COOKIE,
  });

  if (status !== 200) {
    throw new Error(`YouTube 페이지 응답 코드 ${status}`);
  }

  const ytInitialData = _extractYtInitialData(data);
  if (!ytInitialData) {
    throw new Error("YouTube 페이지에서 플레이리스트 데이터를 찾을 수 없습니다.");
  }

  const cfg = _extractYtcfg(data);
  const { videos, continuation } = _collectFromTree(ytInitialData);

  const tracks = videos.map(_videoToTrack).filter(Boolean);

  // continuation 토큰을 따라 나머지 곡을 모두 가져온다 (최대 ~안전장치)
  let token = continuation;
  let guard = 0;
  while (token && guard < 50) {
    guard++;
    let cont;
    try {
      cont = await _fetchContinuation(token, cfg);
    } catch (e) {
      console.log(`[playlist-parser] continuation 중단: ${e.message}`);
      break;
    }
    const { videos: more, continuation: next } = _collectFromTree(cont);
    if (!more.length) break;
    for (const v of more) {
      const t = _videoToTrack(v);
      if (t) tracks.push(t);
    }
    token = next;
  }

  const playlistTitle = _extractPlaylistTitle(ytInitialData, listId);
  return { playlistTitle, trackCount: tracks.length, tracks };
}

// ── 방법 2: Innertube browse API 직접 호출 (fallback) ──

async function _parseFromInnertube(listId) {
  // ytcfg 를 얻기 위해 먼저 가벼운 HTML 요청을 한 번 한다.
  let cfg = {
    apiKey: FALLBACK_API_KEY,
    clientVersion: FALLBACK_CLIENT_VERSION,
    visitorData: null,
  };
  try {
    const { data } = await _httpsGet(
      `https://www.youtube.com/playlist?list=${listId}&hl=ko`,
      {
        "User-Agent": UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Cookie: CONSENT_COOKIE,
      },
    );
    cfg = _extractYtcfg(data);
  } catch {
    /* HTML 실패해도 fallback 키로 시도 */
  }

  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: cfg.clientVersion,
        hl: "ko",
        gl: "KR",
        ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {}),
      },
    },
    browseId: `VL${listId}`,
  };

  const { status, data } = await _httpsPost(
    `https://www.youtube.com/youtubei/v1/browse?key=${cfg.apiKey}&prettyPrint=false`,
    body,
    {
      "User-Agent": UA,
      Origin: "https://www.youtube.com",
      Referer: "https://www.youtube.com/",
      "X-Youtube-Client-Name": "1",
      "X-Youtube-Client-Version": cfg.clientVersion,
      ...(cfg.visitorData ? { "X-Goog-Visitor-Id": cfg.visitorData } : {}),
    },
  );

  if (status !== 200) throw new Error(`Innertube API returned ${status}`);

  const json = JSON.parse(data);
  const { videos, continuation } = _collectFromTree(json);
  const tracks = videos.map(_videoToTrack).filter(Boolean);

  // continuation 처리
  let token = continuation;
  let guard = 0;
  while (token && guard < 50) {
    guard++;
    let cont;
    try {
      cont = await _fetchContinuation(token, cfg);
    } catch {
      break;
    }
    const { videos: more, continuation: next } = _collectFromTree(cont);
    if (!more.length) break;
    for (const v of more) {
      const t = _videoToTrack(v);
      if (t) tracks.push(t);
    }
    token = next;
  }

  const playlistTitle = _extractPlaylistTitle(json, listId);
  return { playlistTitle, trackCount: tracks.length, tracks };
}

// ── 공개 API ──

async function parsePlaylist(url) {
  const listId = validatePlaylistUrl(url);
  if (!listId) throw new Error(`올바르지 않은 재생목록 URL입니다: ${url}`);

  const errors = [];

  // 1순위: HTML(ytInitialData) — 가장 안정적이고 메타데이터가 풍부
  try {
    const result = await _parseFromHtml(listId);
    if (result.tracks.length > 0) return result;
    errors.push("HTML: 곡을 찾지 못함");
  } catch (e) {
    errors.push(`HTML: ${e.message}`);
    console.log(`[playlist-parser] HTML 파싱 실패: ${e.message}, Innertube 시도...`);
  }

  // 2순위: Innertube browse API
  try {
    const result = await _parseFromInnertube(listId);
    if (result.tracks.length > 0) return result;
    errors.push("Innertube: 곡을 찾지 못함");
  } catch (e) {
    errors.push(`Innertube: ${e.message}`);
    console.log(`[playlist-parser] Innertube 실패: ${e.message}`);
  }

  console.log(`[playlist-parser] 모든 방법 실패: ${errors.join(" | ")}`);
  throw new Error(
    "재생목록을 가져올 수 없습니다. URL을 확인하거나 공개 재생목록인지 확인해 주세요.",
  );
}

module.exports = { parsePlaylist, validatePlaylistUrl };
