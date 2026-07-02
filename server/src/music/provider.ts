import type { PlaybackState, Track } from "../types.js";

/** Read-only catalog access (search). Implemented by AppleMusicProvider / MockMusicProvider. */
export interface MusicCatalog {
  readonly name: string;
  search(query: string, limit?: number): Promise<Track[]>;
  getTrack(trackId: string): Promise<Track | null>;
}

/**
 * Full music engine: catalog + playback control.
 * Playback is delegated to the host player (MusicKit on the Mac/host page),
 * so implementations bridge to it rather than playing audio in-process.
 */
export interface MusicProvider extends MusicCatalog {
  play(trackId: string): Promise<void>;
  addToQueue(trackId: string): Promise<void>;
  getNowPlaying(): PlaybackState;
}
