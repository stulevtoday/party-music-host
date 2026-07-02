import { test } from "node:test";
import assert from "node:assert/strict";
import { Party, MAX_QUEUE_LENGTH } from "../src/party.js";
import type { QueueItem } from "../src/types.js";
import type { Track } from "../src/types.js";

const track = (id: string): Track => ({
  id, title: "T" + id, artist: "A", album: "Al", artworkUrl: null, durationMs: 1000
});

function mustEnqueue(p: Party, id: string, by = "g"): QueueItem {
  const r = p.enqueue(track(id), by);
  assert(r.ok, `enqueue ${id} rejected`);
  return r.item;
}

test("first enqueued track starts playing, next ones queue up", () => {
  const p = new Party();
  mustEnqueue(p, "1", "g1");
  mustEnqueue(p, "2", "g1");
  assert.equal(p.state.playback.current?.track.id, "1");
  assert.equal(p.state.queue.length, 1);
});

test("one track = one entry: duplicates rejected while playing or queued", () => {
  const p = new Party();
  mustEnqueue(p, "1"); // playing
  mustEnqueue(p, "2"); // queued
  assert.deepEqual(p.enqueue(track("1"), "g"), { ok: false, reason: "duplicate" });
  assert.deepEqual(p.enqueue(track("2"), "g"), { ok: false, reason: "duplicate" });
});

test("queue is capped at MAX_QUEUE_LENGTH", () => {
  const p = new Party();
  mustEnqueue(p, "playing");
  for (let i = 0; i < MAX_QUEUE_LENGTH; i++) mustEnqueue(p, "q" + i);
  assert.deepEqual(p.enqueue(track("overflow"), "g"), { ok: false, reason: "queue_full" });
});

test("upvotes reorder the queue, ties broken by request time", () => {
  const p = new Party();
  mustEnqueue(p, "0"); // playing
  const a = mustEnqueue(p, "a");
  const b = mustEnqueue(p, "b");
  p.upvote(b.entryId, "g1");
  assert.deepEqual(p.state.queue.map((q) => q.entryId), [b.entryId, a.entryId]);
  p.upvote(b.entryId, "g1"); // toggle off
  assert.deepEqual(p.state.queue.map((q) => q.entryId), [a.entryId, b.entryId]);
});

test("skip requires majority of guests", () => {
  const p = new Party();
  p.addGuest("g1");
  p.addGuest("g2");
  p.addGuest("g3");
  mustEnqueue(p, "1", "g1");
  mustEnqueue(p, "2", "g1");
  assert.equal(p.skipThreshold, 2);
  assert.equal(p.voteSkip("g1"), false);
  assert.equal(p.state.playback.current?.track.id, "1");
  assert.equal(p.voteSkip("g2"), true);
  assert.equal(p.state.playback.current?.track.id, "2");
});

test("trackEnded advances and goes idle at end of queue", () => {
  const p = new Party();
  mustEnqueue(p, "1");
  p.trackEnded();
  assert.equal(p.state.playback.status, "idle");
  assert.equal(p.state.playback.current, null);
});
