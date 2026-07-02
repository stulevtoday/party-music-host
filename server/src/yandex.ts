import type { Track } from "./types.js";
import type { MusicCatalog } from "./music/provider.js";

export interface YandexTrackRef {
  albumId: string | null;
  trackId: string;
}

/** Parse a Yandex Music link like https://music.yandex.ru/album/123/track/456 */
export function parseYandexLink(link: string): YandexTrackRef | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (!/(^|\.)music\.yandex\.(ru|com)$/.test(url.hostname)) return null;
  const m = url.pathname.match(/^(?:\/album\/(\d+))?\/track\/(\d+)/);
  if (!m || !m[2]) return null;
  return { albumId: m[1] ?? null, trackId: m[2] };
}

export interface YandexMeta {
  title: string;
  artist: string;
}

/**
 * Fetch public metadata (title/artist) for a Yandex Music track page
 * via its Open Graph tags — no auth, no private APIs.
 */
export async function fetchYandexMeta(
  ref: YandexTrackRef,
  fetchImpl: typeof fetch = fetch
): Promise<YandexMeta | null> {
  const path = ref.albumId
    ? `/album/${ref.albumId}/track/${ref.trackId}`
    : `/track/${ref.trackId}`;
  const res = await fetchImpl(`https://music.yandex.ru${path}`, {
    headers: { "User-Agent": "Mozilla/5.0 (PartyMusicHost metadata fetch)" }
  });
  if (!res.ok) return null;
  const html = await res.text();
  const og = (prop: string): string | null => {
    const m = html.match(
      new RegExp(`<meta[^>]+property="og:${prop}"[^>]+content="([^"]*)"`, "i")
    );
    return m?.[1] ?? null;
  };
  const title = og("title");
  if (!title) return null;
  return parseOgTitle(decodeEntities(title));
}

/** Yandex og:title looks like "Artist — Track" or "Track — Artist. Слушать онлайн" */
export function parseOgTitle(title: string): YandexMeta {
  const cleaned = title.replace(/\.\s*(Слушать онлайн.*|Listen online.*)$/iu, "").trim();
  const parts = cleaned.split(/\s[—-]\s/);
  if (parts.length >= 2) {
    return { artist: parts[0]!.trim(), title: parts.slice(1).join(" — ").trim() };
  }
  return { artist: "", title: cleaned };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Resolve a Yandex Music link to the best-matching track in the active provider. */
export async function matchYandexLink(
  link: string,
  provider: MusicCatalog
): Promise<Track | null> {
  const ref = parseYandexLink(link);
  if (!ref) return null;
  const meta = await fetchYandexMeta(ref);
  if (!meta) return null;
  const query = [meta.artist, meta.title].filter(Boolean).join(" ");
  const results = await provider.search(query, 5);
  return results[0] ?? null;
}
