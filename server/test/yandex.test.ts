import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYandexLink, parseOgTitle } from "../src/yandex.js";

test("parses album/track links", () => {
  assert.deepEqual(
    parseYandexLink("https://music.yandex.ru/album/123/track/456?utm=x"),
    { albumId: "123", trackId: "456" }
  );
  assert.deepEqual(
    parseYandexLink("https://music.yandex.com/track/789"),
    { albumId: null, trackId: "789" }
  );
});

test("rejects non-yandex and malformed links", () => {
  assert.equal(parseYandexLink("https://example.com/track/1"), null);
  assert.equal(parseYandexLink("not a url"), null);
  assert.equal(parseYandexLink("https://music.yandex.ru/artist/1"), null);
});

test("parses og:title into artist/title", () => {
  assert.deepEqual(parseOgTitle("Кино — Группа крови"), {
    artist: "Кино",
    title: "Группа крови"
  });
  assert.deepEqual(parseOgTitle("Queen — Bohemian Rhapsody. Слушать онлайн на Яндекс Музыке"), {
    artist: "Queen",
    title: "Bohemian Rhapsody"
  });
});
