import { randomUUID } from "node:crypto";
import type { PartyState, PlaybackState, QueueItem, Track } from "./types.js";

export const MAX_QUEUE_LENGTH = 50;

export type EnqueueResult =
  | { ok: true; item: QueueItem }
  | { ok: false; reason: "duplicate" | "queue_full" };

/**
 * Core party state machine: queue, votes, current track.
 * Pure domain logic — no transport concerns, easy to test.
 */
export class Party {
  private queue: QueueItem[] = [];
  private playback: PlaybackState = {
    status: "idle",
    current: null,
    positionMs: 0,
    updatedAt: Date.now()
  };
  private guests = new Set<string>();
  private seq = 0;

  constructor(private onChange: () => void = () => {}) {}

  addGuest(guestId: string): void {
    this.guests.add(guestId);
    this.onChange();
  }

  removeGuest(guestId: string): void {
    this.guests.delete(guestId);
    // A departed guest's skip votes no longer count.
    if (this.playback.current) {
      const votes = this.playback.current.skipVotes;
      const i = votes.indexOf(guestId);
      if (i !== -1) votes.splice(i, 1);
    }
    this.onChange();
  }

  get skipThreshold(): number {
    return Math.max(1, Math.ceil(this.guests.size / 2));
  }

  /** One track = one entry: rejects tracks already playing or queued. */
  enqueue(track: Track, requestedBy: string): EnqueueResult {
    if (this.queue.length >= MAX_QUEUE_LENGTH) return { ok: false, reason: "queue_full" };
    const isDuplicate =
      this.playback.current?.track.id === track.id ||
      this.queue.some((q) => q.track.id === track.id);
    if (isDuplicate) return { ok: false, reason: "duplicate" };
    const item: QueueItem = {
      entryId: randomUUID(),
      track,
      requestedBy,
      requestedAt: Date.now(),
      seq: this.seq++,
      upvotes: [],
      skipVotes: []
    };
    this.queue.push(item);
    if (this.playback.status === "idle") this.advance();
    else this.onChange();
    return { ok: true, item };
  }

  /** Toggle an upvote; queue is kept ordered by votes then request time. */
  upvote(entryId: string, guestId: string): void {
    const item = this.queue.find((q) => q.entryId === entryId);
    if (!item) return;
    const i = item.upvotes.indexOf(guestId);
    if (i === -1) item.upvotes.push(guestId);
    else item.upvotes.splice(i, 1);
    this.reorder();
    this.onChange();
  }

  /** Vote to skip the current track. Returns true if the skip happened. */
  voteSkip(guestId: string): boolean {
    const current = this.playback.current;
    if (!current) return false;
    if (!current.skipVotes.includes(guestId)) current.skipVotes.push(guestId);
    if (current.skipVotes.length >= this.skipThreshold) {
      this.advance();
      return true;
    }
    this.onChange();
    return false;
  }

  removeEntry(entryId: string): void {
    this.queue = this.queue.filter((q) => q.entryId !== entryId);
    this.onChange();
  }

  /** Host reports the current track finished (or was skipped locally). */
  trackEnded(): void {
    this.advance();
  }

  skip(): void {
    this.advance();
  }

  updatePlayback(status: "playing" | "paused", positionMs: number): void {
    if (!this.playback.current) return;
    this.playback.status = status;
    this.playback.positionMs = positionMs;
    this.playback.updatedAt = Date.now();
    this.onChange();
  }

  private advance(): void {
    const next = this.queue.shift() ?? null;
    this.playback = {
      status: next ? "playing" : "idle",
      current: next,
      positionMs: 0,
      updatedAt: Date.now()
    };
    this.onChange();
  }

  private reorder(): void {
    this.queue.sort(
      (a, b) => b.upvotes.length - a.upvotes.length || a.seq - b.seq
    );
  }

  get state(): PartyState {
    return {
      playback: this.playback,
      queue: this.queue,
      guestCount: this.guests.size,
      skipThreshold: this.skipThreshold
    };
  }
}
