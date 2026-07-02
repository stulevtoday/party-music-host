import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.js";
import type { Track } from "../src/types.js";

const track: Track = { id: "1", title: "T", artist: "A", album: "Al", artworkUrl: null, durationMs: 1000 };

test("rate limit: one accepted request per 5s per device", () => {
  const store = new Store(null);
  assert.equal(store.canRequest("d1"), true);
  store.recordRequest(track, "d1", "g", true);
  assert.equal(store.canRequest("d1"), false);
  assert.equal(store.canRequest("d2"), true); // other devices unaffected
});

test("rejected requests do not consume the rate limit and are kept in history", () => {
  const store = new Store(null);
  store.recordRequest(track, "d1", "g", false, "duplicate");
  assert.equal(store.canRequest("d1"), true);
  assert.equal(store.history.length, 1);
  assert.equal(store.history[0]?.reason, "duplicate");
});

test("devices are tracked with last-seen time", () => {
  const store = new Store(null);
  store.touchDevice("d1", "Гость-1");
  store.touchDevice("d1");
  assert.equal(store.deviceList.length, 1);
  assert.equal(store.deviceList[0]?.name, "Гость-1");
});
