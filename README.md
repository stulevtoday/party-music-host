# PartyMusicHost

Локальная система заказа музыки для вечеринок: гости в Wi-Fi сети заказывают треки
с телефонов, Mac воспроизводит их через **официальный MusicKit**, звук выводится на
**Apple TV / HomePod через AirPlay**. Работает полностью локально, без облака.

## Архитектура

```
Гости (телефоны) ──HTTP/WS──▶ Mac: Node-сервер (очередь, голоса, поиск, Яндекс-матчинг)
                                   │
                                   ▼
                        Host-плеер (браузер на Mac, MusicKit JS)
                                   │  системный AirPlay
                                   ▼
                        Apple TV ──▶ HomePod
```

- **Сервер** (`server/`, TypeScript/Node): REST + WebSocket. Очередь, голосование
  за скип (большинство гостей), апвоуты (переупорядочивают очередь), поиск по
  каталогу Apple Music (официальный `api.music.apple.com` + developer token),
  резолв ссылок Яндекс.Музыки (публичные og-теги → match в Apple Music).
- **Guest UI** (`web/guest/`): мобильный веб — поиск/ссылка, заказ, голоса, live-очередь.
- **Host-плеер** (`web/host/`): страница на Mac с **MusicKit JS v3** — авторизация
  Apple Music, воспроизведение головы очереди, отчёт о прогрессе на сервер.
  Никаких UI-хаков: только официальные MusicKit API.
- **Apple TV + HomePod**: выберите их как AirPlay-выход звука macOS
  (Пункт управления → Звук). Весь звук плеера идёт туда.

Без Apple-ключей сервер стартует в **demo-режиме** (mock-каталог, симуляция
воспроизведения) — удобно для разработки и проверки UI.

## Запуск

```bash
npm install
cp .env.example .env        # заполните Apple-ключи (или оставьте demo-режим)
set -a; source .env; set +a
npm run dev
```

- Гости: `http://<IP-Mac-в-LAN>:8080/`
- Хост-плеер (на Mac): `http://localhost:8080/host/` → «Войти в Apple Music»

Для Apple Music нужны: аккаунт Apple Developer, MusicKit-ключ (`.p8`), Team ID,
Key ID и активная подписка Apple Music на аккаунте хоста.

## API

| Метод | Путь | Описание |
|---|---|---|
| GET/POST | `/api/search?q=` | поиск треков (Apple Music или mock) |
| POST | `/api/request` | заказ трека `{track, guestName, deviceId}`; лимит 1 заказ/5с на устройство, без дублей, очередь ≤ 50 |
| GET | `/api/queue` | текущая очередь + порог скипа |
| POST | `/api/vote` | апвоут `{entryId, deviceId}` (toggle) |
| POST | `/api/skip` | голос за скип `{deviceId}` |
| GET | `/api/now-playing` | текущий трек и позиция |
| GET | `/api/history` | история заказов (также пишется в `data/history.jsonl`) |
| POST | `/api/yandex-link` | резолв ссылки Яндекс.Музыки `{link}` |

WebSocket `/ws`: сервер шлёт `state` (полный снимок), `queue_changed`,
`now_playing_changed`, `play` (host); клиенты — `hello`, `upvote`, `voteSkip`,
`removeEntry`/`playbackUpdate`/`trackEnded` (host). Типы — `server/src/types.ts`.

Music engine (`server/src/music/`): интерфейс `MusicProvider`
(`search`, `getTrack`, `play`, `addToQueue`, `getNowPlaying`) — реализация
`PartyMusicEngine` поверх каталога (`AppleMusicProvider` | `MockMusicProvider`)
и host-плеера.

## Команды

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # unit-тесты (очередь, голосование, парсинг Яндекс-ссылок)
```

## Расширение до нативных клиентов

Серверный протокол (см. `server/src/types.ts`) транспортно-независим:

- **macOS-приложение**: замените host-страницу на Swift-приложение с
  `MusicKit` (`ApplicationMusicPlayer`), подключающееся к тому же WebSocket.
- **tvOS-клиент**: SwiftUI-приложение на Apple TV с `MusicKit` — играет очередь
  напрямую на Apple TV (HomePod как default audio output tvOS), плюс экран
  «сейчас играет» для гостей. Подключается к тому же `/ws` и `/api/state`.
