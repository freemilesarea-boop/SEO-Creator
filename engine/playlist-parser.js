/**
 * Playlist Parser (Node.js)
 * yt-dlp CLI를 child_process로 호출하여 플레이리스트 정보 추출
 */
const { execFile } = require("child_process");
const { URL } = require("url");

const YT_HOSTS = new Set(["www.youtube.com","youtube.com","m.youtube.com","music.youtube.com"]);

function validatePlaylistUrl(url) {
  try {
    const u = new URL(url);
    if (!["http:","https:"].includes(u.protocol)) return null;
    if (!YT_HOSTS.has(u.hostname)) return null;
    const listId = u.searchParams.get("list");
    if (!listId || !/^[A-Za-z0-9_-]+$/.test(listId)) return null;
    return listId;
  } catch { return null; }
}

function _parseArtistTitle(raw) {
  for (const sep of [" - "," – "," — "," | "]) {
    if (raw.includes(sep)) {
      const [a, ...rest] = raw.split(sep);
      const artist = a.trim();
      const title = rest.join(sep).trim();
      if (artist && title) return { artist, title };
    }
  }
  return { artist: "Unknown", title: raw.trim() };
}

function parsePlaylist(url) {
  return new Promise((resolve, reject) => {
    const listId = validatePlaylistUrl(url);
    if (!listId) return reject(new Error(`Invalid playlist URL: ${url}`));

    const canonical = `https://www.youtube.com/playlist?list=${listId}`;
    const args = [
      "--flat-playlist", "--dump-json", "--no-warnings",
      "--ignore-errors", "--no-download", canonical
    ];

    // yt-dlp가 설치되어 있는지 확인
    execFile("yt-dlp", args, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`yt-dlp failed: ${err.message}`));

      const tracks = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          let artist = entry.artist || entry.creator || entry.uploader || null;
          let title = entry.title || "Unknown";
          if (!artist || artist === title) {
            const parsed = _parseArtistTitle(title);
            artist = parsed.artist; title = parsed.title;
          }
          tracks.push({ title, artist, durationSeconds: entry.duration ? Math.round(entry.duration) : null });
        } catch { /* skip invalid JSON lines */ }
      }

      if (!tracks.length) return reject(new Error("Playlist is empty or unavailable"));

      resolve({
        playlistTitle: `Playlist ${listId}`,
        trackCount: tracks.length,
        tracks,
      });
    });
  });
}

module.exports = { parsePlaylist, validatePlaylistUrl };
