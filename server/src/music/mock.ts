import type { Track } from "../types.js";
import type { MusicCatalog } from "./provider.js";

const CATALOG: Track[] = [
  { id: "m1", title: "Bohemian Rhapsody", artist: "Queen", album: "A Night at the Opera", artworkUrl: null, durationMs: 354000 },
  { id: "m2", title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", artworkUrl: null, durationMs: 200000 },
  { id: "m3", title: "Smells Like Teen Spirit", artist: "Nirvana", album: "Nevermind", artworkUrl: null, durationMs: 301000 },
  { id: "m4", title: "Кукла колдуна", artist: "Король и Шут", album: "Акустический альбом", artworkUrl: null, durationMs: 194000 },
  { id: "m5", title: "Группа крови", artist: "Кино", album: "Группа крови", artworkUrl: null, durationMs: 285000 },
  { id: "m6", title: "Uptown Funk", artist: "Mark Ronson feat. Bruno Mars", album: "Uptown Special", artworkUrl: null, durationMs: 270000 },
  { id: "m7", title: "Sandstorm", artist: "Darude", album: "Before the Storm", artworkUrl: null, durationMs: 225000 },
  { id: "m8", title: "Танцы", artist: "Мираж", album: "Снова вместе", artworkUrl: null, durationMs: 240000 }
];

/** In-memory provider used when Apple Music credentials are not configured (demo mode). */
export class MockMusicProvider implements MusicCatalog {
  readonly name = "mock";

  async search(query: string, limit = 10): Promise<Track[]> {
    const q = query.toLowerCase();
    return CATALOG.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    ).slice(0, limit);
  }

  async getTrack(trackId: string): Promise<Track | null> {
    return CATALOG.find((t) => t.id === trackId) ?? null;
  }
}
