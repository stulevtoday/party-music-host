import type { Track } from "../types.js";

export interface MusicProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<Track[]>;
}
