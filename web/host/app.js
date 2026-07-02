const $ = (id) => document.getElementById(id);

let state = null;
let ws;
let music = null;          // MusicKit instance ("apple" mode)
let mode = "mock";
let currentEntryId = null;
let mockTimer = null;

function connect() {
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "hello", role: "host" }));
    $("status").textContent = "онлайн (" + mode + ")";
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") { state = msg.state; onState(); }
  };
  ws.onclose = () => setTimeout(connect, 1500);
}

async function init() {
  const res = await fetch("/api/musickit-token" + location.search);
  const body = await res.json();
  mode = body.mode;
  if (mode === "apple") {
    await new Promise((r) =>
      window.MusicKit ? r() : document.addEventListener("musickitloaded", r, { once: true })
    );
    music = await MusicKit.configure({
      developerToken: body.token,
      app: { name: "PartyMusicHost", build: "0.1.0" }
    });
    music.addEventListener("playbackStateDidChange", reportPlayback);
    music.addEventListener("playbackTimeDidChange", reportPlayback);
    music.addEventListener("mediaItemStateDidChange", reportPlayback);
    music.addEventListener("queueItemsDidChange", () => {});
    music.addEventListener("playbackStateDidChange", () => {
      if (music.playbackState === MusicKit.PlaybackStates.completed) trackEnded();
    });
  } else {
    $("authorize-btn").textContent = "Demo-режим (без Apple Music)";
    $("authorize-btn").disabled = true;
  }
  connect();
}
init();

function reportPlayback() {
  if (!music || ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "playbackUpdate",
    status: music.isPlaying ? "playing" : "paused",
    positionMs: Math.round((music.currentPlaybackTime || 0) * 1000)
  }));
}

function trackEnded() {
  ws.send(JSON.stringify({ type: "trackEnded" }));
}

async function onState() {
  const current = state.playback.current;
  $("np-title").textContent = current ? current.track.title : "—";
  $("np-artist").textContent = current ? current.track.artist : "";
  $("np-art").src = current?.track.artworkUrl || "";
  renderQueue();

  const entryId = current?.entryId ?? null;
  if (entryId !== currentEntryId) {
    currentEntryId = entryId;
    if (!current) return stopLocal();
    if (mode === "apple" && music) {
      if (!music.isAuthorized) return; // will start after authorize
      await music.setQueue({ song: current.track.id });
      await music.play();
    } else {
      startMockPlayback(current);
    }
  }
}

/* Demo mode: simulate playback with a timer so the queue advances. */
function startMockPlayback(item) {
  stopLocal();
  const durationMs = Math.min(item.track.durationMs || 90000, 90000);
  const startedAt = Date.now();
  mockTimer = setInterval(() => {
    const pos = Date.now() - startedAt;
    if (pos >= durationMs) { stopLocal(); trackEnded(); return; }
    ws.send(JSON.stringify({ type: "playbackUpdate", status: "playing", positionMs: pos }));
  }, 1000);
}

function stopLocal() {
  if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
}

function renderQueue() {
  const ul = $("queue");
  ul.innerHTML = "";
  for (const item of state.queue) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="grow">
        <div class="title ellipsis"></div>
        <div class="muted ellipsis"></div>
      </div>
      <span class="muted">👍 ${item.upvotes.length}</span>
      <button class="secondary">✕</button>`;
    li.querySelector(".title").textContent = item.track.title;
    li.querySelector(".muted").textContent = `${item.track.artist} · ${item.requestedBy}`;
    li.querySelector("button").onclick = () =>
      ws.send(JSON.stringify({ type: "removeEntry", entryId: item.entryId }));
    ul.appendChild(li);
  }
  if (!state.queue.length) ul.innerHTML = '<li class="muted">Очередь пуста</li>';
}

$("authorize-btn").onclick = async () => {
  if (!music) return;
  await music.authorize();
  if (currentEntryId && state?.playback.current) {
    await music.setQueue({ song: state.playback.current.track.id });
    await music.play();
  }
};

$("play-btn").onclick = async () => {
  if (mode !== "apple" || !music) return;
  if (music.isPlaying) await music.pause();
  else await music.play();
};

$("next-btn").onclick = () => { stopLocal(); trackEnded(); };
