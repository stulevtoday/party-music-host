const $ = (id) => document.getElementById(id);
const guestName = localStorage.guestName || (localStorage.guestName = "Гость-" + Math.floor(Math.random() * 1000));
const deviceId = localStorage.deviceId || (localStorage.deviceId = crypto.randomUUID());

let state = null;
let ws;

function connect() {
  ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "hello", role: "guest", name: guestName }));
    $("status").textContent = guestName;
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") { state = msg.state; render(); }
  };
  ws.onclose = () => {
    $("status").textContent = "переподключение…";
    setTimeout(connect, 1500);
  };
}
connect();

function render() {
  const { playback, queue, skipThreshold } = state;
  const np = $("now-playing");
  if (playback.current) {
    np.classList.remove("hidden");
    $("np-title").textContent = playback.current.track.title;
    $("np-artist").textContent = playback.current.track.artist;
    $("np-art").src = playback.current.track.artworkUrl || "";
    $("skip-count").textContent = playback.current.skipVotes.length;
    $("skip-need").textContent = skipThreshold;
  } else {
    np.classList.add("hidden");
  }

  const ul = $("queue");
  ul.innerHTML = "";
  for (const item of queue) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="grow">
        <div class="title ellipsis"></div>
        <div class="muted ellipsis"></div>
      </div>
      <button class="secondary">👍 ${item.upvotes.length}</button>`;
    li.querySelector(".title").textContent = item.track.title;
    li.querySelector(".muted").textContent = `${item.track.artist} · заказал ${item.requestedBy}`;
    li.querySelector("button").onclick = () =>
      ws.send(JSON.stringify({ type: "upvote", entryId: item.entryId }));
    ul.appendChild(li);
  }
  if (!queue.length) ul.innerHTML = '<li class="muted">Очередь пуста — закажи первый трек!</li>';
}

$("skip-btn").onclick = () => ws.send(JSON.stringify({ type: "voteSkip" }));

let searchTimer;
$("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) return renderResults([]);
  searchTimer = setTimeout(() => doSearch(q), 350);
});

async function doSearch(q) {
  if (/^https?:\/\/music\.yandex\./.test(q)) {
    const res = await fetch("/api/yandex-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link: q })
    });
    const body = await res.json();
    renderResults(res.ok ? [body.track] : [], res.ok ? null : body.error);
    return;
  }
  const res = await fetch("/api/search?q=" + encodeURIComponent(q));
  const body = await res.json();
  renderResults(body.tracks || [], body.error);
}

function renderResults(tracks, error) {
  const box = $("search-results");
  box.innerHTML = "";
  if (error) { box.innerHTML = `<div class="muted">${error}</div>`; return; }
  for (const t of tracks) {
    const div = document.createElement("div");
    div.className = "result";
    div.innerHTML = `
      <div class="grow">
        <div class="title ellipsis"></div>
        <div class="muted ellipsis"></div>
      </div>
      <button>＋</button>`;
    div.querySelector(".title").textContent = t.title;
    div.querySelector(".muted").textContent = t.artist;
    div.querySelector("button").onclick = async () => {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: t, guestName, deviceId })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        renderResults([], body.error || "Не удалось заказать трек");
        return;
      }
      $("search-input").value = "";
      renderResults([]);
    };
    box.appendChild(div);
  }
}
