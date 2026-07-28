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
| `{t:"create", room}`     | Raum anlegen (6-stelliger Code), Antwort `created {id, token}` |
| `{t:"join", room}`       | Raum beitreten, Antwort `joined {id, token, hostId}` oder `err` |
| `{t:"rejoin", room, id, token}` | Mitgliedschaft fortsetzen (Reload/Abriss), Antwort zusätzlich mit `members` |
| `{t:"msg", to, data}`    | Relay: `to` = `"host"` \| `"all"` \| `<peerId>`          |
| `{t:"leave"}`            | Raum verlassen                                           |

Server → Client: `created`, `joined`, `msg {from, data}`, `peer-joined`,
`peer-left`, `host-down`, `host-up`, `room-closed`, `err {code}`.

Eigenschaften:

- **Server-vergebene Peer-IDs** — Clients können sich nicht als andere ausgeben;
  Peers akzeptieren `game-state` nur vom Host-Peer.
- **Secret-Token pro Mitgliedschaft:** `created`/`joined` liefern zusätzlich ein
  Token, das `rejoin` verlangt. Peer-IDs sind im Raum öffentlich (sie stehen in
  jedem `GameState`), also könnte sonst jeder mit dem Raumcode per `rejoin` die
  Host-ID übernehmen, den echten Host vom Socket trennen und alle `to:"host"`-
  Nachrichten empfangen.
- **60 s Host-Grace-Period:** bricht der Host-Socket weg, bleibt der Raum offen
  (`host-down`); kommt der Host per `rejoin` zurück → `host-up`, sonst `room-closed`.
- **Heartbeat (15 s Ping):** tote Verbindungen werden erkannt, damit
  `peer-left`/`host-down` auch bei stillen Abbrüchen feuern — deutlich kürzer als
  die Grace, damit ein stiller Abriss nicht erst kurz vor Ablauf auffällt.
- Verlässt der Host den Raum **absichtlich** (Leave-Button → `leave`), wird er
  sofort geschlossen. Ein Reload oder ein Tab-Wechsel schickt bewusst KEIN
  `leave` mehr — sonst wäre er nicht wiederherstellbar.
- `rejoin` beantwortet der Server zusätzlich mit `members`, damit ein
  zurückkehrender Host abgleichen kann, wer noch da ist.

## Client-Aufbau (`src/p2p/`)

| Datei           | Verantwortung                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.ts` | Transport: Socket-Lifecycle, Join-Timeouts/-Retries, Auto-Reconnect mit Backoff, AppState-/pageshow-Resume, `resume()` nach Reload, Server-Envelope. Öffentliche API: `createRoom`, `joinRoom`, `rejoinRoom`, `resume`, `dispatch`, `leave`. |
| `host.ts`       | `HostSession`-Klasse: Room-State, Action-Verarbeitung, Reveal-Logik, Disconnect-/Turn-Grace, Runden-Log, Recap, Playback-Orchestrierung, State-Broadcast. Send-Funktion wird injiziert → ohne Transport testbar (`host.test.ts`). |
| `peer.ts`       | Verarbeitung der Host-Nachrichten (`game-state`, `play-song`, `game-recap`, `error`), Stale-State-Filter und Uhr-Offset; Callbacks statt Imports → keine Zyklen.                                        |
| `protocol.ts`   | Typisierte Actions (discriminated unions) + strukturelle Validierung. `game-state`, `game-recap` und der Room-Snapshot werden vollständig geprüft, nichts wird blind gecastet.                          |
| `session.ts`    | Reload-Persistenz: Session (Rolle/Raum/ID/Token) und gedrosselter Host-Snapshot. Storage-Backend ist injizierbar (Web `localStorage`, nativ AsyncStorage, Tests ein Stub).                              |
| `store.ts`      | Zustand: Connection-Status, Peer-Liste, eigene Peer-ID, Uhr-Offset, Resume-Zustand.                                                                                                                     |

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
`year: 0`. Welche Felder gestrippt oder genullt werden, steht als `secret`-Flag
pro Feld in `src/schema/song.ts` — der Parser leitet sich aus derselben Quelle
ab, die Maske kann also nichts produzieren, was die Peers ablehnen würden.
Ebenfalls nie im Broadcast: `room.rounds`. Titel/Artist/Jahr erreichen die Peers
erst mit dem Reveal — auch per DevTools ist die Antwort vorher nicht auslesbar.

## Reconnect & Session-Persistenz

Ein Verbindungsabriss ist **kein Ausscheiden**. Bricht der Socket eines Spielers
weg, markiert der Host ihn `connected: false` und startet eine **60-Sekunden-
Grace**; Sitz, Timeline und Tokens bleiben. Erst danach greift die alte
Entfernungslogik (inklusive „unter 2 Spieler → Spiel vorbei"). Kommt der Spieler
vorher mit derselben Peer-ID zurück, wird der Timer gelöscht und er sitzt wieder
am Tisch. Ausnahmen: in der Lobby fliegt er sofort raus (kein Spielstand zu
schützen, und ein Geist würde einen `maxPlayers`-Platz belegen), und nach
Spielende wird niemand mehr entfernt (Scoreboard und Awards brauchen ihn).

Ist der **aktive** Spieler offline, greift zusätzlich eine **20-Sekunden-
Turn-Grace** — aber nur, wenn nicht ohnehin schon eine Deadline die Phase
regelt (Blitz-Countdown, laufender Buzz). Danach zieht die Runde weiter, ohne
Tokenkosten und ohne Fehlwurf-Eintrag.

Damit ein Reload überhaupt zurückfindet, persistiert der Client zwei Dinge
(`src/p2p/session.ts`, Web `localStorage`, nativ AsyncStorage):

| Schlüssel                | Inhalt                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `bitster.p2p.session`    | Rolle, Raumcode, eigene Peer-ID, Relay-Token, Name             |
| `bitster.p2p.hostRoom`   | Kompletter Room-Snapshot des Hosts (gedrosselt, 2 s)           |

`resume()` in `connection.ts` liest beides, baut beim Host die `HostSession` per
`HostSession.restore()` wieder auf und verbindet sich per `rejoin`. Timer werden
aus den **absoluten** Deadlines neu gestellt: eine Deadline, die während der
Abwesenheit ablief, feuert `Math.max(0, …)` sofort danach statt verloren zu
gehen — jeder Handler prüft seine Vorbedingungen ohnehin erneut, **diese
Invariante muss jeder neue Handler einhalten**. Snapshots mit fremdem Raumcode,
fremder Host-ID, falscher Version oder älter als 30 Minuten werden abgelehnt;
ein Host fällt dann NIE auf `createRoom` zurück, sondern meldet ehrlich, dass die
Session abgelaufen ist.

Host-Migration bleibt bewusst außen vor: ein Peer hatte nur den **maskierten**
GameState, ihm fehlen der ungemaskte aktuelle Song, `pendingResult`, die
Playlist-Indizes und jedes während des Fensters versteckte Jahr.

## Uhren & Reihenfolge

`buzzDeadline` und `placeDeadline` sind absolute Epoch-ms **der Host-Uhr**. Damit
ein Gerät mit falsch gestellter Uhr keinen falschen (womöglich abgelaufenen)
Countdown zeigt, trägt jeder `game-state` ein `hostNow`. Der Peer bildet daraus
den Median der letzten fünf Messungen (`clockOffsetMs` im P2P-Store) und rechnet
alle Deadlines darüber um. Auf dem Host ist der Offset per Konstruktion 0.

Zusätzlich trägt jeder `game-state` eine streng steigende `stateVersion`. Peers
verwerfen alles, was nicht neuer ist als der zuletzt angewandte Stand — sonst
könnte ein verspäteter Broadcast nach einem Reconnect einen neueren State
überschreiben. Die Version wird aus der Wanduhr initialisiert, damit ein
neugestarteter Host nie eine Nummer wiederverwendet, die ein Peer schon gesehen
hat.

## Songquellen

`Room.songSource` sagt, woher die Songs kommen, und entscheidet damit auch, ob
ein Spiel in der Statistik zählt:

- **`playlist`** — ein Link. Der Host holt pro Runde EINEN Track per Index
  (`playlistId` + `playedIndices`), das spart Rate-Limit.
- **`random`** — 🎲 „Surprise Me". Der Host sammelt in der Lobby einmalig einen
  Pool aus **seinen eigenen** Playlists und spielt ihn aus dem Speicher. Fremde
  und redaktionelle Playlists sind seit der Februar-2026-Migration im Dev Mode
  nicht mehr lesbar, und die Bibliotheken der Mitspieler bleiben bewusst außen
  vor: wer einen Song beisteuert, kennt Titel, Artist und Jahr, bevor die Runde
  läuft — das lässt sich durch keine Maskierung reparieren.
- **`demo`** — Mock-Songs ohne Playback. Zählt nicht in der Historie.

Der Pool liegt in `Room.playlist` und wird wie `room.rounds` **nie**
gebroadcastet. Gesammelt wird größengewichtet über die Playlists (jede *Song*
ist gleich wahrscheinlich, nicht jede Playlist), mit Deckeln pro Playlist, pro
Interpret und pro Jahrzehnt — sonst wird aus „Zufall" schnell „vierzig Songs von
einer Band aus einem Jahrzehnt".

## Verfügbarkeit von Songs

Spotify kann Tracks liefern, die sich nicht abspielen lassen. Gefiltert wird
über `is_playable` und `restrictions.reason` — aber **bewusst fail-open**: beide
Felder sind optional, und würde ein fehlendes Feld als „nicht spielbar" gelten,
wäre jedes Spiel sofort vorbei. Ob die Felder überhaupt ankommen, zählt
`getFieldPresence()` im Betrieb mit, und die Lobby zeigt dem Host das Ergebnis
einer Ein-Request-Sonde über die ersten 50 Tracks.

Vollständig lösen lässt sich das nicht: Verfügbarkeit gilt pro Account und
Markt, und `restrictions.reason: "explicit"` ist sogar eine reine
Konto-Einstellung. Der Host kann also grundsätzlich nicht wissen, ob ein Song
bei allen Mitspielern läuft.

## Runden-Log & Recap

Der Host führt in `room.rounds` ein Protokoll: pro Runde Song (mit echtem Jahr),
aktiver Spieler, gewählte Lücke, Verdikt, Guess samt Belohnung, Buzz samt
Ausgang und die Zeit bis zur Platzierung. Geschrieben wird pur in
`game/logic.ts` (`appendRound`), aufgerufen an jeder Stelle, an der eine Runde
endet — Reveal, Blitz-Timeout, Skip, Turn-Grace und Spielerverlust. Ein
`roundRecorded`-Flag verhindert doppelte wie verlorene Einträge.

`room.rounds` verlässt den Host **nie** über `game-state` — es enthält die echten
Jahre auch von Songs, die übersprungen wurden und nie aufgedeckt waren. Erst wenn
das Spiel vorbei ist, baut der Host genau einmal ein `game-recap` und schickt es
an alle. Jedes Gerät legt daraus seinen eigenen Historien-Eintrag an, lokal und
unter seiner eigenen Identität — die Streaming-Account-ID wird dafür benutzt,
geht aber **nie über die Leitung**.

## Deployment

- Ein Container (Dockerfile): `expo export --platform web` → `dist/`,
  `node server.js` serviert Statik **und** `/ws`.
- `ws` ist die einzige Server-Dependency und wird explizit ins Runtime-Image
  kopiert (dort läuft kein `npm ci`).
- Web-Client leitet die Relay-URL vom eigenen Origin ab; Dev/Native setzen
  `EXPO_PUBLIC_RELAY_URL` (siehe `.env.development`, lokal Port 8090).
- Railway: "Enable Serverless" **aus** lassen — der Container muss für offene
  WebSocket-Verbindungen wach bleiben.
