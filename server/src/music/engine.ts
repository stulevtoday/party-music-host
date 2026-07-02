import type { Party } from "../party.js";
import type { PlaybackState, Track } from "../types.js";
import type { MusicCatalog, MusicProvider } from "./provider.js";

/**
 * MusicProvider implementation composing a catalog (Apple Music or mock)
 * with the party queue and the host player, which does the actual
 * MusicKit playback and is reached over WebSocket.
 */
export class PartyMusicEngine implements MusicProvider {
  constructor(
    private catalog: MusicCatalog,
    private party: Party,
    private sendToHost: (trackId: string) => void
  ) {}

  get name(): string {
    return this.catalog.name;
  }

  search(query: string, limit?: number): Promise<Track[]> {
    return this.catalog.search(query, limit);
  }

  getTrack(trackId: string): Promise<Track | null> {
    return this.catalog.getTrack(trackId);
  }

  async play(trackId: string): Promise<void> {
    this.sendToHost(trackId);
  }

  async addToQueue(trackId: string): Promise<void> {
    const track = await this.catalog.getTrack(trackId);
    if (!track) throw new Error(`track not found: ${trackId}`);
    const result = this.party.enqueue(track, "api");
    if (!result.ok) throw new Error(result.reason);
  }

  getNowPlaying(): PlaybackState {
    return this.party.state.playback;
  }
}
