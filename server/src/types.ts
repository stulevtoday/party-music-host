export interface Track {
  /** Apple Music catalog id (or mock id in demo mode) */
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  durationMs: number;
}

export interface QueueItem {
  /** Unique queue entry id (one track can be queued twice) */
  entryId: string;
  track: Track;
  requestedBy: string;
  requestedAt: number;
  /** Monotonic insertion counter used as a stable tie-breaker */
  seq: number;
  /** Guest ids that upvoted / voted to skip */
  upvotes: string[];
  skipVotes: string[];
}

export interface PlaybackState {
  status: "idle" | "playing" | "paused";
  current: QueueItem | null;
  positionMs: number;
  updatedAt: number;
}

export interface PartyState {
  playback: PlaybackState;
  queue: QueueItem[];
  guestCount: number;
  skipThreshold: number;
}

export interface Device {
  deviceId: string;
  name: string;
  lastSeenAt: number;
}

export interface RequestHistoryEntry {
  track: Track;
  deviceId: string;
  requestedBy: string;
  requestedAt: number;
  accepted: boolean;
  reason?: string;
}

/** Messages broadcast from server to all clients */
export type ServerEvent =
  | { type: "state"; state: PartyState }
  | { type: "queue_changed"; queue: QueueItem[]; skipThreshold: number }
  | { type: "now_playing_changed"; playback: PlaybackState }
  | { type: "play"; trackId: string } // host only: play a specific track now
  | { type: "error"; message: string };

/** Messages sent by clients over WebSocket */
export type ClientCommand =
  | { type: "hello"; role: "guest" | "host"; name?: string }
  | { type: "upvote"; entryId: string }
  | { type: "voteSkip" }
  | { type: "removeEntry"; entryId: string } // host only
  | { type: "playbackUpdate"; status: "playing" | "paused"; positionMs: number } // host only
  | { type: "trackEnded" }; // host only
