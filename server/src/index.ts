import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { Party } from "./party.js";
import { AppleMusicProvider } from "./music/appleMusic.js";
import { MockMusicProvider } from "./music/mock.js";
import type { MusicProvider } from "./music/provider.js";
import { matchYandexLink } from "./yandex.js";
import type { ClientCommand, ServerEvent } from "./types.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOST_KEY = process.env.HOST_KEY ?? "";

function createProvider(): { provider: MusicProvider; apple: AppleMusicProvider | null } {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH, APPLE_STOREFRONT } = process.env;
  if (APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY_PATH) {
    const apple = new AppleMusicProvider({
      teamId: APPLE_TEAM_ID,
      keyId: APPLE_KEY_ID,
      privateKey: readFileSync(APPLE_PRIVATE_KEY_PATH, "utf8"),
      storefront: APPLE_STOREFRONT ?? "ru"
    });
    return { provider: apple, apple };
  }
  console.warn("Apple Music credentials not set — running in mock/demo mode.");
  return { provider: new MockMusicProvider(), apple: null };
}

const { provider, apple } = createProvider();
const party = new Party(broadcast);

const app = express();
app.use(express.json());

const webRoot = path.resolve(fileURLToPath(import.meta.url), "../../../web");
app.use("/", express.static(path.join(webRoot, "guest")));
app.use("/host", express.static(path.join(webRoot, "host")));

app.get("/api/state", (_req, res) => res.json(party.state));

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ tracks: [] });
  try {
    res.json({ tracks: await provider.search(q), provider: provider.name });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

app.post("/api/queue", (req, res) => {
  const { track, guestName } = req.body ?? {};
  if (!track?.id || !track?.title) return res.status(400).json({ error: "track required" });
  const item = party.enqueue(track, String(guestName ?? "guest"));
  res.json({ entryId: item.entryId });
});

app.post("/api/yandex-link", async (req, res) => {
  const link = String(req.body?.link ?? "");
  try {
    const track = await matchYandexLink(link, provider);
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

function broadcast(): void {
  const msg: ServerEvent = { type: "state", state: party.state };
  const data = JSON.stringify(msg);
  for (const c of clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}

wss.on("connection", (ws) => {
  const client: Client = { ws, id: randomUUID(), role: "guest" };
  clients.add(client);
  party.addGuest(client.id);
  ws.send(JSON.stringify({ type: "state", state: party.state } satisfies ServerEvent));

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
