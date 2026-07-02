import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { Party } from "./party.js";
import { Store } from "./store.js";
import { AppleMusicProvider } from "./music/appleMusic.js";
import { MockMusicProvider } from "./music/mock.js";
import { PartyMusicEngine } from "./music/engine.js";
import type { MusicCatalog } from "./music/provider.js";
import { matchYandexLink } from "./yandex.js";
import type { ClientCommand, ServerEvent, Track } from "./types.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOST_KEY = process.env.HOST_KEY ?? "";
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(fileURLToPath(import.meta.url), "../../../data");

function createCatalog(): { catalog: MusicCatalog; apple: AppleMusicProvider | null } {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH, APPLE_STOREFRONT } = process.env;
  if (APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY_PATH) {
    const apple = new AppleMusicProvider({
      teamId: APPLE_TEAM_ID,
      keyId: APPLE_KEY_ID,
      privateKey: readFileSync(APPLE_PRIVATE_KEY_PATH, "utf8"),
      storefront: APPLE_STOREFRONT ?? "ru"
    });
    return { catalog: apple, apple };
  }
  console.warn("Apple Music credentials not set — running in mock/demo mode.");
  return { catalog: new MockMusicProvider(), apple: null };
}

const { catalog, apple } = createCatalog();
const party = new Party(broadcast);
const store = new Store(DATA_DIR);
const provider = new PartyMusicEngine(catalog, party, (trackId) =>
  sendToHosts({ type: "play", trackId })
);

const app = express();
app.use(express.json());

const webRoot = path.resolve(fileURLToPath(import.meta.url), "../../../web");
app.use("/", express.static(path.join(webRoot, "guest")));
app.use("/host", express.static(path.join(webRoot, "host")));

function deviceId(req: Request): string {
  return String(req.body?.deviceId ?? req.headers["x-device-id"] ?? req.ip ?? "unknown");
}

app.get("/api/state", (_req, res) => res.json(party.state));

async function handleSearch(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? req.body?.q ?? "").trim();
  if (!q) {
    res.json({ tracks: [] });
    return;
  }
  try {
    res.json({ tracks: await provider.search(q), provider: provider.name });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
}
app.get("/api/search", handleSearch);
app.post("/api/search", handleSearch);

/** Order a track: rate-limited per device, deduplicated, queue capped. */
function handleRequest(req: Request, res: Response): void {
  const { track, guestName } = req.body ?? {};
  if (!track?.id || !track?.title) {
    res.status(400).json({ error: "track required" });
    return;
  }
  const device = deviceId(req);
  const name = String(guestName ?? "guest");
  store.touchDevice(device, name);
  if (!store.canRequest(device)) {
    store.recordRequest(track as Track, device, name, false, "rate_limited");
    res.status(429).json({ error: "Не так быстро — один заказ раз в 5 секунд" });
    return;
  }
  const result = party.enqueue(track as Track, name);
  if (!result.ok) {
    store.recordRequest(track as Track, device, name, false, result.reason);
    const message =
      result.reason === "duplicate" ? "Этот трек уже в очереди" : "Очередь заполнена (макс. 50)";
    res.status(409).json({ error: message, reason: result.reason });
    return;
  }
  store.recordRequest(track as Track, device, name, true);
  res.json({ entryId: result.item.entryId });
}
app.post("/api/request", handleRequest);
app.post("/api/queue", handleRequest); // backwards-compatible alias

app.get("/api/queue", (_req, res) =>
  res.json({ queue: party.state.queue, skipThreshold: party.skipThreshold })
);

app.get("/api/now-playing", (_req, res) => res.json(provider.getNowPlaying()));

app.post("/api/vote", (req, res) => {
  const entryId = String(req.body?.entryId ?? "");
  if (!entryId) return res.status(400).json({ error: "entryId required" });
  const device = deviceId(req);
  store.touchDevice(device);
  party.upvote(entryId, device);
  res.json({ ok: true });
});

app.post("/api/skip", (req, res) => {
  const device = deviceId(req);
  store.touchDevice(device);
  const skipped = party.voteSkip(device);
  res.json({ skipped, skipThreshold: party.skipThreshold });
});

app.get("/api/history", (_req, res) => res.json({ history: store.history }));

app.post("/api/yandex-link", async (req, res) => {
  const link = String(req.body?.link ?? "");
  try {
    const track = await matchYandexLink(link, catalog);
    if (!track) return res.status(404).json({ error: "Track not found or link not recognized" });
    res.json({ track });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** MusicKit JS on the host page needs the developer token to authorize playback. */
app.get("/api/musickit-token", (req, res) => {
  if (HOST_KEY && req.query.key !== HOST_KEY) return res.status(403).json({ error: "forbidden" });
  if (!apple) return res.json({ token: null, mode: "mock" });
  res.json({ token: apple.developerToken(), mode: "apple" });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

interface Client {
  ws: WebSocket;
  id: string;
  role: "guest" | "host";
}
const clients = new Set<Client>();

function send(ws: WebSocket, msg: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendToHosts(msg: ServerEvent): void {
  for (const c of clients) if (c.role === "host") send(c.ws, msg);
}

let lastNowPlayingEntry: string | null = null;
let lastQueueKey = "";

/** Push full state plus granular queue_changed / now_playing_changed events. */
function broadcast(): void {
  const state = party.state;
  const events: ServerEvent[] = [{ type: "state", state }];

  const nowPlayingEntry = state.playback.current?.entryId ?? null;
  if (nowPlayingEntry !== lastNowPlayingEntry) {
    lastNowPlayingEntry = nowPlayingEntry;
    events.push({ type: "now_playing_changed", playback: state.playback });
  }
  const queueKey = state.queue.map((q) => `${q.entryId}:${q.upvotes.length}`).join(",");
  if (queueKey !== lastQueueKey) {
    lastQueueKey = queueKey;
    events.push({ type: "queue_changed", queue: state.queue, skipThreshold: state.skipThreshold });
  }

  for (const msg of events) for (const c of clients) send(c.ws, msg);
}

wss.on("connection", (ws) => {
  const client: Client = { ws, id: randomUUID(), role: "guest" };
  clients.add(client);
  party.addGuest(client.id);
  send(ws, { type: "state", state: party.state });

  ws.on("message", (raw) => {
    let cmd: ClientCommand;
    try {
      cmd = JSON.parse(String(raw));
    } catch {
      return;
    }
    switch (cmd.type) {
      case "hello":
        client.role = cmd.role;
        store.touchDevice(client.id, cmd.name ?? "");
        break;
      case "upvote":
        party.upvote(cmd.entryId, client.id);
        break;
      case "voteSkip":
        party.voteSkip(client.id);
        break;
      case "removeEntry":
        if (client.role === "host") party.removeEntry(cmd.entryId);
        break;
      case "playbackUpdate":
        if (client.role === "host") party.updatePlayback(cmd.status, cmd.positionMs);
        break;
      case "trackEnded":
        if (client.role === "host") party.trackEnded();
        break;
    }
  });

  ws.on("close", () => {
    clients.delete(client);
    party.removeGuest(client.id);
  });
});

server.listen(PORT, () => {
  console.log(`PartyMusicHost listening on http://0.0.0.0:${PORT}`);
  console.log(`Guests:  http://<mac-lan-ip>:${PORT}/`);
  console.log(`Host UI: http://localhost:${PORT}/host/`);
});
