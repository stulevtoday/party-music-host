import jwt from "jsonwebtoken";
import type { Track } from "../types.js";
import type { MusicProvider } from "./provider.js";

export interface AppleMusicConfig {
  teamId: string;
  keyId: string;
  /** Contents of the .p8 private key from the Apple Developer portal */
  privateKey: string;
  storefront: string;
}

interface CatalogSong {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    durationInMillis: number;
    artwork?: { url: string };
  };
}

/**
 * Official Apple Music API client (https://api.music.apple.com).
 * Uses a developer token (ES256 JWT) — no scraping, no UI automation.
 */
export class AppleMusicProvider implements MusicProvider {
  readonly name = "apple-music";
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private config: AppleMusicConfig) {}

  /** Developer token, cached and refreshed before expiry (max lifetime 6 months; we use 12h). */
  developerToken(): string {
    const now = Date.now();
    if (this.token && this.token.expiresAt - now > 60_000) return this.token.value;
    const ttlSec = 12 * 3600;
    const value = jwt.sign({}, this.config.privateKey, {
      algorithm: "ES256",
      issuer: this.config.teamId,
      expiresIn: ttlSec,
      keyid: this.config.keyId
    });
    this.token = { value, expiresAt: now + ttlSec * 1000 };
    return value;
  }

  async search(query: string, limit = 10): Promise<Track[]> {
    const url = new URL(
      `https://api.music.apple.com/v1/catalog/${this.config.storefront}/search`
    );
    url.searchParams.set("term", query);
    url.searchParams.set("types", "songs");
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.developerToken()}` }
    });
    if (!res.ok) throw new Error(`Apple Music search failed: ${res.status}`);
    const body = (await res.json()) as {
      results?: { songs?: { data?: CatalogSong[] } };
    };
    return (body.results?.songs?.data ?? []).map(toTrack);
  }
}

function toTrack(song: CatalogSong): Track {
  const a = song.attributes;
  return {
    id: song.id,
    title: a.name,
    artist: a.artistName,
    album: a.albumName,
    durationMs: a.durationInMillis,
    artworkUrl: a.artwork ? a.artwork.url.replace("{w}", "200").replace("{h}", "200") : null
  };
}
