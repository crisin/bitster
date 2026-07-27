# bitster – Multiplayer-Architektur (WebSocket-Relay)

> **Hinweis:** Dieses Dokument beschrieb ursprünglich eine serverlose
> WebRTC/Trystero-Architektur. Die wurde im Juli 2026 bewusst verworfen —
> Begründung siehe unten. Aktuell gilt: **dünner WebSocket-Relay auf dem
> bestehenden Railway-Server, Host-Peer bleibt Game Authority.**

## Überblick

```
┌──────────┐   WSS /ws   ┌─────────────────┐   WSS /ws   ┌──────────┐
│ Host-Peer│ ◄─────────► │  Relay-Server    │ ◄─────────► │  Peer(s) │
│ (Browser)│             │  (server.js auf  │             │ (Browser)│
│  = Game  │             │   Railway)       │             │          │
│ Authority│             │  KEINE Spiellogik│             │          │
└──────────┘             └─────────────────┘             └──────────┘
```

- Der **Relay-Server** (`server.js`, gleicher Prozess, der den Web-Build serviert)
  verwaltet Räume und leitet opake Nachrichten weiter. Er kennt keine Spielregeln.
- Der **Host-Peer** hält den kompletten Spielzustand (`HostSession` in
  `src/p2p/host.ts`), validiert jede Aktion und broadcastet den `GameState`.
- **Peers** senden Aktionen an den Host und rendern den empfangenen State.
- **Spotify** läuft weiterhin komplett client-seitig (PKCE, Web API Remote
  Control) — der Server sieht nie Tokens.

## Warum kein WebRTC mehr?

Der ursprüngliche Plan (Trystero + Firebase-Signaling + TURN) wurde verworfen:

1. Der Railway-Server läuft sowieso (Web-Build-Hosting) — "serverlos" war keiner.
2. WebRTC verursachte die Join-Probleme: kein TURN (~30 % Mobilfunk-NATs scheitern),
   öffentliche Nostr-Relays als Signaling, mehrdeutiger Join-Handshake.
3. Natives iOS/Android hätte `react-native-webrtc` + Polyfills gebraucht;
   WebSocket funktioniert in React Native out of the box.
4. Weniger externe Dienste: kein Firebase, kein Metered.ca, keine Public Relays.

Übertragen werden nur kleine JSON-States (die Musik kommt von Spotify direkt) —
Latenz und Serverlast sind vernachlässigbar.

## Relay-Protokoll (`server.js` ↔ `src/p2p/connection.ts`)

Client → Server:

| Message                  | Zweck                                                    |
| ------------------------ | -------------------------------------------------------- |
| `{t:"create", room}`     | Raum anlegen (6-stelliger Code), Antwort `created {id}`  |
| `{t:"join", room}`       | Raum beitreten, Antwort `joined {id, hostId}` oder `err` |
| `{t:"rejoin", room, id}` | Mitgliedschaft nach Verbindungsabbruch fortsetzen        |
| `{t:"msg", to, data}`    | Relay: `to` = `"host"` \| `"all"` \| `<peerId>`          |
| `{t:"leave"}`            | Raum verlassen                                           |

Server → Client: `created`, `joined`, `msg {from, data}`, `peer-joined`,
`peer-left`, `host-down`, `host-up`, `room-closed`, `err {code}`.

Eigenschaften:

- **Server-vergebene Peer-IDs** — Clients können sich nicht als andere ausgeben;
  Peers akzeptieren `game-state` nur vom Host-Peer.
- **30 s Host-Grace-Period:** bricht der Host-Socket weg, bleibt der Raum offen
  (`host-down`); kommt der Host per `rejoin` zurück → `host-up`, sonst `room-closed`.
- **Heartbeat (30 s Ping):** tote Verbindungen werden erkannt, damit
  `peer-left`/`host-down` auch bei stillen Abbrüchen feuern.
- Verlässt der Host den Raum **absichtlich** (`leave`), wird er sofort geschlossen
  (sein Spielzustand ist weg).

## Client-Aufbau (`src/p2p/`)

| Datei           | Verantwortung                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.ts` | Transport: Socket-Lifecycle, Join-Timeouts/-Retries, Auto-Reconnect mit Backoff, AppState-Resume-Rejoin, Server-Envelope. Öffentliche API: `createRoom`, `joinRoom`, `rejoinRoom`, `dispatch`, `leave`. |
| `host.ts`       | `HostSession`-Klasse: Room-State, Action-Verarbeitung, Reveal-Logik, Playback-Orchestrierung, State-Broadcast. Send-Funktion wird injiziert → ohne Transport testbar (`host.test.ts`).                  |
| `peer.ts`       | Verarbeitung der Host-Nachrichten (`game-state`, `play-song`, `error`); Callbacks statt Imports → keine Zyklen.                                                                                         |
| `protocol.ts`   | Typisierte Actions (discriminated unions) + strukturelle Validierung. `game-state` wird vollständig geprüft (`validateGameState`), nichts wird blind gecastet.                                          |
| `store.ts`      | Zustand: Connection-Status, Peer-Liste, eigene Peer-ID.                                                                                                                                                 |

## Join-Handshake

1. Peer verbindet zum Relay, sendet `join` → Server bestätigt nur, wenn der Raum
   existiert (sonst sofort ein klarer Fehler).
2. Peer schickt die `join`-Action an den Host (mit Retry, 3×/3 s).
3. Host validiert (`logic.addPlayer`: Raum voll? Spiel läuft?) und broadcastet.
4. **Erst der erste `game-state` vom Host schaltet auf "connected".**
   12-s-Timeout und Ablehnungen (voll/läuft) landen sichtbar im Fehler-Banner.

## Anti-Cheat im Broadcast

`logic.buildGameState` maskiert während `playing`/`bitster-window` den aktuellen
Song: er fehlt in `playedSongs`, und die tentativ platzierte Karte trägt
`year: 0`. Titel/Artist/Jahr erreichen die Peers erst mit dem Reveal — auch per
DevTools ist die Antwort vorher nicht auslesbar.

## Deployment

- Ein Container (Dockerfile): `expo export --platform web` → `dist/`,
  `node server.js` serviert Statik **und** `/ws`.
- `ws` ist die einzige Server-Dependency und wird explizit ins Runtime-Image
  kopiert (dort läuft kein `npm ci`).
- Web-Client leitet die Relay-URL vom eigenen Origin ab; Dev/Native setzen
  `EXPO_PUBLIC_RELAY_URL` (siehe `.env.development`, lokal Port 8090).
- Railway: "Enable Serverless" **aus** lassen — der Container muss für offene
  WebSocket-Verbindungen wach bleiben.
