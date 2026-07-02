import { test } from "node:test";
import assert from "node:assert/strict";
import { Party } from "../src/party.js";
import type { Track } from "../src/types.js";

const track = (id: string): Track => ({
  id, title: "T" + id, artist: "A", album: "Al", artworkUrl: null, durationMs: 1000
});

test("first enqueued track starts playing, next ones queue up", () => {
  const p = new Party();
  p.enqueue(track("1"), "g1");
  p.enqueue(track("2"), "g1");
  assert.equal(p.state.playback.current?.track.id, "1");
  assert.equal(p.state.queue.length, 1);
});

test("upvotes reorder the queue, ties broken by request time", () => {
  const p = new Party();
  p.enqueue(track("0"), "g"); // playing
  const a = p.enqueue(track("a"), "g");
  const b = p.enqueue(track("b"), "g");
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
  p.enqueue(track("1"), "g1");
  p.enqueue(track("2"), "g1");
  assert.equal(p.skipThreshold, 2);
  assert.equal(p.voteSkip("g1"), false);
  assert.equal(p.state.playback.current?.track.id, "1");
  assert.equal(p.voteSkip("g2"), true);
  assert.equal(p.state.playback.current?.track.id, "2");
});

test("trackEnded advances and goes idle at end of queue", () => {
  const p = new Party();
  p.enqueue(track("1"), "g");
  p.trackEnded();
  assert.equal(p.state.playback.status, "idle");
  assert.equal(p.state.playback.current, null);
});
