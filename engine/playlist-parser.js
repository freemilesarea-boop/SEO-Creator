/**
 * Playlist Parser (Node.js)
 *
 * YouTube 재생목록에서 곡 정보를 추출한다.
 * yt-dlp 불필요 — HTTPS로 YouTube 페이지를 직접 파싱.
 *
 * 순서:
 * 1. YouTube Innertube API (browse endpoint)
 * 2. 실패 시 YouTube 페이지 HTML 파싱 fallback
 */

const https = require("https");
const { URL } = require("url");

const YT_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com"]);

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

// ── HTTPS 요청 헬퍼 ──

function _httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Request timeout")); });
  });
}

function _httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Request timeout")); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ── 방법 1: YouTube 페이지 HTML에서 ytInitialData 파싱 ──

async function _parseFromHtml(listId) {
  const url = `https://www.youtube.com/playlist?list=${listId}`;
  const { data } = await _httpsGet(url, {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  });

  // ytInitialData JSON 추출
  const match = data.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!match) {
    // 다른 패턴 시도
    const match2 = data.match(/ytInitialData\s*=\s*'(\{.+?\})'/s);
    if (!match2) throw new Error("YouTube 페이지에서 플레이리스트 데이터를 찾을 수 없습니다.");
    return _extractTracksFromInitialData(JSON.parse(match2[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))));
  }

  return _extractTracksFromInitialData(JSON.parse(match[1]));
}

function _extractTracksFromInitialData(data) {
  const tracks = [];

  // 다양한 경로에서 비디오 목록 찾기
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const contents =
      tab?.tabRenderer?.content?.sectionListRenderer?.contents ||
      [];
    for (const section of contents) {
      const items =
        section?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents ||
        [];
      for (const item of items) {
        const video = item?.playlistVideoRenderer;
        if (!video) continue;

        const rawTitle = video?.title?.runs?.map((r) => r.text).join("") || video?.title?.simpleText || "Unknown";
        const channelName = video?.shortBylineText?.runs?.map((r) => r.text).join("") || "";
        const lengthSeconds = parseInt(video?.lengthSeconds || "0", 10) || null;

        let artist, title;
        if (channelName && channelName !== rawTitle) {
          artist = channelName;
          title = rawTitle;
        } else {
          ({ artist, title } = _parseArtistTitle(rawTitle));
        }

        // " - Topic" 제거 (YouTube Music 채널)
        artist = artist.replace(/ - Topic$/, "").trim();

        tracks.push({ title, artist, durationSeconds: lengthSeconds });
      }
    }
  }

  // 플레이리스트 제목
  const playlistTitle =
    data?.metadata?.playlistMetadataRenderer?.title ||
    data?.header?.playlistHeaderRenderer?.title?.simpleText ||
    "Playlist";

  return { playlistTitle, trackCount: tracks.length, tracks };
}

// ── 방법 2: YouTube Innertube API ──

async function _parseFromInnertube(listId) {
  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240101.00.00",
        hl: "ko",
        gl: "KR",
      },
    },
    browseId: `VL${listId}`,
  };

  const { status, data } = await _httpsPost(
    "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
    body
  );

  if (status !== 200) throw new Error(`Innertube API returned ${status}`);

  const json = JSON.parse(data);
  const tracks = [];

  // Innertube 응답에서 비디오 추출
  const tabs = json?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const sectionContents = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const section of sectionContents) {
      const items = section?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || [];
      for (const item of items) {
        const video = item?.playlistVideoRenderer;
        if (!video) continue;

        const rawTitle = video?.title?.runs?.map((r) => r.text).join("") || "Unknown";
        const channelName = video?.shortBylineText?.runs?.map((r) => r.text).join("") || "";
        const lengthSeconds = parseInt(video?.lengthSeconds || "0", 10) || null;

        let artist, title;
        if (channelName && channelName !== rawTitle) {
          artist = channelName.replace(/ - Topic$/, "").trim();
          title = rawTitle;
        } else {
          ({ artist, title } = _parseArtistTitle(rawTitle));
        }

        tracks.push({ title, artist, durationSeconds: lengthSeconds });
      }
    }
  }

  const playlistTitle = json?.header?.playlistHeaderRenderer?.title?.simpleText ||
    json?.metadata?.playlistMetadataRenderer?.title || `Playlist ${listId}`;

  return { playlistTitle, trackCount: tracks.length, tracks };
}

// ── 공개 API ──

async function parsePlaylist(url) {
  const listId = validatePlaylistUrl(url);
  if (!listId) throw new Error(`올바르지 않은 재생목록 URL입니다: ${url}`);

  // 1순위: Innertube API
  try {
    const result = await _parseFromInnertube(listId);
    if (result.tracks.length > 0) return result;
  } catch (e) {
    console.log(`[playlist-parser] Innertube failed: ${e.message}, trying HTML...`);
  }

  // 2순위: HTML 파싱
  try {
    const result = await _parseFromHtml(listId);
    if (result.tracks.length > 0) return result;
  } catch (e) {
    console.log(`[playlist-parser] HTML parse failed: ${e.message}`);
  }

  throw new Error("재생목록을 가져올 수 없습니다. URL을 확인하거나 공개 재생목록인지 확인해 주세요.");
}

module.exports = { parsePlaylist, validatePlaylistUrl };
