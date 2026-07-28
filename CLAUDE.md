# bitster – P2P Music Guessing Game

## Was ist das?

bitster ist ein Multiplayer-Partyspiel: Songs werden abgespielt, Spieler ordnen sie chronologisch in ihre Timeline ein. Wer zuerst 10 Songs richtig einordnet, gewinnt. Ein Streaming-Dienst liefert die Musik (aktuell Spotify, weitere geplant), die App ist nur Steuerung + Spiellogik.

## Architektur: Host-Authority über WebSocket-Relay

Die Spiellogik läuft komplett client-seitig; ein **dünner WebSocket-Relay** auf dem
ohnehin vorhandenen Railway-Server (`server.js`, serviert auch den Web-Build) vermittelt
die Nachrichten. Der Server kennt keine Spielregeln — er verwaltet nur Räume und leitet
opake Messages weiter.

- **Transport:** WebSocket (`/ws` auf demselben Origin wie die App; nativ via `EXPO_PUBLIC_RELAY_URL`)
- **Auth:** Provider-spezifisch (Spotify PKCE, etc.), komplett client-seitig
- **Playback:** Provider-spezifisch (Spotify Web API Remote Control, etc.)
- **State:** Host-Peer ist Authority, broadcastet State an alle Peers (Relay = dumb pipe)
- **Plattform:** React Native (Expo) für iOS + Android, mit Web-Support

Bewusste Entscheidung gegen WebRTC/Trystero: Da der Railway-Server sowieso läuft,
spart das Relay Signaling-Dienst, TURN-Server und `react-native-webrtc` — und Joins
funktionieren in jedem Netz, in dem WSS funktioniert.

**Voraussetzung:** Alle Spieler haben einen unterstützten Streaming-Dienst (aktuell Spotify Premium) und die zugehörige App installiert.

## Tech Stack

- **App:** React Native (Expo) — iOS, Android, Web (react-native-web)
- **Multiplayer:** WebSocket-Relay auf dem Railway-Server (`server.js` + `ws`), Host-Peer als Game Authority
- **Auth:** Provider-spezifisch, client-only (Spotify PKCE via expo-auth-session)
- **Playback:** Provider-spezifisch (Spotify Web API Remote Control)
- **State:** Zustand (game / streaming / p2p / theme Stores)
- **Navigation:** Expo Router
- **Storage:** expo-secure-store bzw. localStorage (Tokens), AsyncStorage (UI-Settings,
  Spielhistorie), localStorage/AsyncStorage (Reload-Session + Host-Snapshot)
- **Styling:** StyleSheet.create + eigenes Theme-System (`src/theme/`), kein CSS-Framework
- **Tests:** Vitest (`logic`, `modes`, `host`, `peer`, `protocol`, `session`, `schema/song`, `history/*`, `theme/shader/reaction`, `logger`)

## Projektstruktur

```
server.js                     # WebSocket-Relay + Static Hosting (Railway), KEINE Spiellogik
app/                          # Expo Router screens
  _layout.tsx                 # Root Layout (Fonts, Theme, Debug-Bridge __bitsterStores)
  index.tsx                   # Home – Connect Spotify, Create/Join Room
  game.tsx                    # Game Screen (Phase-Switch + BottomBar)
  about.tsx                   # Info & Licenses
  stats.tsx                   # Historie + Allzeit-Statistik (local-first)
  auth/callback.tsx           # Streaming Auth Callback (Deep Link, Web + nativ)

src/
  streaming/                  # === Streaming Provider Abstraction ===
    types.ts                  # StreamingProvider Interface + Track/PlaylistMeta
    registry.ts               # Provider-Registry (registerProvider/getProvider/listProviders)
    store.ts                  # Zustand – Provider, Auth-Status, Geräte, Account, PlaybackError
    providers/spotify/
      auth.ts                 # PKCE Flow, Token-Rotation, Cross-Tab-Sync, fetchWithAuth
      player.ts               # Remote Control (play/pause/getDevices/setDevice)
      playlist.ts             # Lazy Track-Fetching (getTrackAtIndex), Playlist-Meta, Sonde
      songMapping.ts          # Spotify-Payload → Track, Feld-Query, Verfügbarkeits-Zähler
      randomPool.ts           # "Surprise Me": Zufalls-Pool aus den eigenen Playlists
      diagnostics.ts          # "Spotify check" (Account, Premium, Devices)
      errors.ts               # 403-Interpretation (Allowlist/Premium/Dev-Mode)
      index.ts                # SpotifyProvider (implements StreamingProvider)

  schema/                     # === Song-Feldschema (Leaf, importiert nichts) ===
    song.ts                   # SONG_FIELDS + abgeleitet: Song-Typ, Parser, Antwort-Maske

  p2p/                        # === Multiplayer Layer ===
    connection.ts             # Transport: Socket-Lifecycle, Join/Rejoin/Reconnect, resume(), dispatch()
    host.ts                   # HostSession: Authority, Action-Validierung, Timer, Runden-Log, Recap
    peer.ts                   # Peer-Seite: game-state/play-song/recap/error vom Host anwenden
    protocol.ts               # P2PAction Types + Wire-Validierung (Action/GameState/Recap/Room)
    session.ts                # Reload-Persistenz: Session (Raum/ID/Token) + Host-Room-Snapshot
    store.ts                  # Zustand – Connection Status, Peer List, Peer ID, Uhr-Offset

  history/                    # === Lokale Spielhistorie (local-first, kein Server) ===
    types.ts                  # StoredGame/StoredRound + Limits (50 Spiele, 400 KB)
    identity.ts               # Identität: Streaming-Account-ID, Fallback Geräte-UUID
    storage.ts                # AsyncStorage-Zugriff, Ringpuffer, Schema-Migrationsnaht
    store.ts                  # Zustand – gespeicherte Spiele, letztes Spiel, Identitäts-Merge
    aggregate.ts              # PUR: Bestenliste, Trefferquote, Jahrzehnte, Angstgegner

  game/                       # === Pure Game Logic (kein UI, kein I/O) ===
    logic.ts                  # createRoom, placeSong, resolveBuzz, evaluateGuess, buildGameState …
    modes.ts                  # Spielmodi als Presets über GameRules (modeFor/describeRules)
    types.ts                  # Room, Player(+stats/penalties), Song, Phase, GameSettings, GameState
    store.ts                  # Zustand – passiver Mirror des GameState-Broadcasts

  theme/                      # === Themes + Effekte ===
    themes.ts                 # Built-in Themes (inkl. Trippy/Tadi), ThemeEffects
    customTheme.ts            # User-Theme (Basis + Akzent + Effekt-Toggles)
    effectTempo.ts            # Effekt-Geschwindigkeit: Presets, Slider-Faktor, Tap-Tempo-BPM
    store.ts                  # Zustand – Theme/Font/Textgröße/Effect-Speed (persistiert)
    themedStyles.ts           # createThemedStyles/useTheme/useThemeColors
    ThemeOverlay.tsx          # Effekt-Layer (Rainbow, Swirl, Pulse, Floaties, …)
    PointerEffects.tsx        # Maus-Effekte: Warp-Linse, Taschenlampe, Klick-Glitch (Web)
    shader/                   # Fullscreen-Fragment-Shader (Web; nativ = Stub)
      presets.ts              # GLSL: 12 Presets (Kaleidoskop, Plasma, Tunnel, … Fireworks, Storm)
      reaction.ts             # PUR: Spielzustand → Shader-Uniforms (Countdown, Verdikt)
      ShaderLayer.web.tsx     # Canvas + WebGL-Runtime, rAF, Context-Loss
      quality.ts              # Auflösungsstufen (der große Performance-Hebel)
    typography.ts             # Font-Optionen + Skalierung

  components/
    ui/                       # Primitive: Button, Input, Chip, Badge, Card, BottomBar,
                              # Divider, Pressable, Slider, StatusDot, DevLogButton
    game/                     # Timeline(+Card/Gap), RevealCard, NowPlaying, ScoreBoard,
                              # Awards, GuessForm, BuzzerButton, Stage, CountdownPill,
                              # AllPlayerTimelines, MiniTimeline, PlayedSongs,
                              # RoundLog (aufklappbar, Events pro Runde), TokenLedger
      phases/                 # LobbyView, PlayingView, BitsterWindowView, RevealView, FinishedView
    lobby/                    # RoomCode, GameSettings, PlayerSlot
    streaming/                # ConnectButton, DeviceSelector, ConnectionCheck
    settings/                 # SettingsMenu, CustomThemeEditor, EffectSettings, TextSettings

  hooks/                      # useHaptics, useConnectionStatus, useCurrentPlayer, useGamePulse
  utils/                      # constants.ts (Design-Tokens), roomCode.ts, logger.ts

assets/                       # fonts/ (OFL) + icon.png/favicon.png (generierte Platzhalter,
                              # zum Ersetzen einfach PNGs überschreiben)
```

### Streaming Provider Interface

Jeder Streaming-Dienst implementiert das gleiche Interface.
Die App spricht nur mit dem Interface, nie direkt mit Spotify/Apple/etc.

```typescript
// src/streaming/types.ts
interface StreamingProvider {
  id: string; // 'spotify' | 'apple-music' | ...
  name: string; // 'Spotify'
  color: string; // Brand Color für UI
  auth: StreamingAuth;
  player: StreamingPlayer;
  library: StreamingLibrary;
}

interface StreamingAuth {
  login(): Promise<void>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;
  refreshToken(): Promise<void>;
}

interface StreamingPlayer {
  play(trackUri: string): Promise<void>;
  pause(): Promise<void>;
  getDevices(): Promise<StreamingDevice[]>;
  setDevice(deviceId: string): Promise<void>;
}

interface StreamingLibrary {
  // Lazy: EIN Track pro Runde (offset={index}&limit=1) statt ganze Playlist laden
  getTrackAtIndex(playlistId: string, index: number): Promise<Track | null>;
  parsePlaylistUrl(url: string): string | null;
  getPlaylistMeta(playlistId: string): Promise<PlaylistMeta>;
}

// Provider-agnostischer Track — das benutzt die Game Logic (Song ist feldidentisch)
interface Track {
  id: string; // Provider-spezifische ID
  uri: string; // Provider-spezifische URI
  name: string;
  artist: string; // komma-separiert bei mehreren
  year: number;
  imageUrl?: string;
  durationMs?: number;
  explicit?: boolean;
  popularity?: number; // 0-100 → Deep-Cut/Banger-Badges im Reveal
  albumName?: string;
}
```

Reale Interfaces haben zusätzlich `icon` und optionales `diagnostics` auf dem
Provider — `src/streaming/types.ts` ist die Wahrheit.

**Neue Song-Felder gehören in `src/schema/song.ts`, sonst nirgends.** Aus
`SONG_FIELDS` werden Typ (`Song` und `Track` sind derselbe abgeleitete Shape),
Wire-Parser (`buildSong`), Antwort-Maske (`maskSecrets`) und der Spotify-
`fields`-Query erzeugt. Pro Feld wird deklariert, ob es `required` ist und was
im Broadcast damit passiert, solange die Runde noch geraten wird: `keep`,
`strip` (fliegt raus) oder `zero` (wird ersetzt, z. B. `year: 0`). Wo das Feld
beim Provider herkommt, verlangt der Compiler in
`streaming/providers/spotify/songMapping.ts` — die einzige Stelle, die
menschliches Wissen braucht. Einzige nicht erzwungene Stelle bleibt
`history/storage.ts` (`toStoredGame`), und zwar bewusst: dort steht eine
Whitelist, damit ein neues Feld nicht ungefragt den Speicher aller Geräte
aufbläht.

### Store-Aufteilung

Getrennte Stores statt einem monolithischen:

| Store                | Verantwortung                                            | Zugriff                  |
| -------------------- | -------------------------------------------------------- | ------------------------ |
| `game/store.ts`      | Phase, Scores, Timelines, CurrentSong, Settings           | Überall                  |
| `streaming/store.ts` | Aktiver Provider, Auth State, Token, Gerät               | Streaming UI, Host       |
| `p2p/store.ts`       | Connection Status, Peer List, Peer ID, Uhr-Offset         | Connection UI, Host/Peer |
| `history/store.ts`   | Gespeicherte Spiele, letztes Spiel, Identität (lokal)    | Stats-UI, Host/Peer      |

Dazu kommt `theme/store.ts` (UI-Settings, persistiert, unabhängig vom Spiel).
Stores sind unabhängig — kein Store importiert einen anderen. Orchestrierung
läuft über `p2p/host.ts` / `p2p/peer.ts` (lesen/schreiben die Spiel-Stores);
`p2p/connection.ts` ist reiner Transport. Die Verknüpfung von Streaming-Account
und Historien-Identität passiert in `app/_layout.tsx`, damit die beiden Stores
nichts voneinander wissen müssen.

## Arbeitsweise

Dieses Projekt wird **vollständig KI-gestützt** entwickelt. Keine manuellen Zeitschätzungen — wir iterieren Phase für Phase, so schnell wie der Output es erlaubt.

## Konventionen

- **Sprache:** Code + Kommentare auf Englisch, Docs auf Deutsch
- **TypeScript:** Strikt. Keine `any`, keine impliziten Typen
- **State:** Zustand Stores, kein Context/useReducer für globalen State
- **Styling:** StyleSheet.create über `createThemedStyles` (Theme-System), Design-Tokens aus `utils/constants.ts`
- **Naming:** camelCase für Variablen/Funktionen, PascalCase für Komponenten/Typen
- **Dateien:** Komponenten .tsx, Logic .ts, keine .jsx/.js
- **Imports:** Absolute Imports via `@/` Alias (src/)
- **Tests:** Vitest für Logic/Modes/Host/Peer/Protocol/Session/Schema/History/Shader-Reaction
  (keine Component-Tests aktuell)
- **P2P Messages:** Typisierte Actions mit discriminated unions, Wire-Input IMMER durch `validateAction`
- **Design-Direktive:** ABFAHRT — Party-App, im Zweifel die verspieltere Variante (Effekte hinter `ThemeEffects`-Flags, Layer bleibt `pointerEvents="none"`)

## Spielablauf

1. **Home:** Spieler gibt Namen ein, erstellt oder joint Raum (6-Zeichen-Code)
2. **Lobby:** Der Host wählt die Songquelle — Playlist-Link **oder** 🎲 "Surprise Me"
   (Zufalls-Pool aus seinen eigenen Playlists, größengewichtet, mit Artist- und
   Jahrzehnt-Deckel). Alle connecten Spotify via PKCE.
   Darüber liegt der **Modus-Picker** (`game/modes.ts`): Classic, Blitz, Party,
   Connoisseur, Marathon, Speedrun, No bitster — jeder Modus ist nur ein
   benannter Punkt im selben Regelraum, den "Fine-tuning" auch von Hand
   erreicht (dann zeigt der Picker ⚙️ Custom). Der aktive Modus wird aus den
   Settings **abgeleitet** (`modeFor`), nie gespeichert. Peers sehen dieselben
   Regeln als Zusammenfassung (`describeRules`), können sie aber nicht ändern.
   Settings sind NUR in der Lobby änderbar.
   Host kann zusätzlich **lokale Spieler** anlegen (Pass-and-Play am Host-Gerät,
   `Player.isLocal`); das Host-Gerät steuert deren Züge/Buzzes via `dispatch(action, { as: localId })`.
   Online-Peers können keine lokalen Spieler haben. Ohne Playlist-Link startet ein
   stilles Demo-Spiel (Mock-Songs, kein Playback).
3. **Playing:** Song spielt auf allen Geräten. Der aktive Spieler kann EINMAL
   raten, rerollen oder in seine Timeline platzieren. Was ein Guess wert ist,
   bestimmt `rules.guess`: `require` sagt, ob Titel, Artist, eines von beiden
   oder beide stimmen müssen (+1★), `yearBonus`/`yearTolerance` den Jahres-Bonus
   (+1★; Toleranz > 0 fängt nebenbei Remaster-Jahre ab, siehe P4). Die Belohnung
   fällt erst beim Reveal, damit der Token-Broadcast nichts verrät. Der Reroll
   kostet `rules.skip.cost` (0 = gratis) und kann ganz aus sein.
   ⚡Blitz-Modus: Countdown (`placeDeadline`) — läuft er ab, ist der Song weg
   (failedSongs, "TOO SLOW!").
4. **bitster-window:** Wird **übersprungen**, wenn bitster in diesem Modus aus
   ist (`rules.buzz.enabled`) oder der aktive Spieler noch keine Karte hatte —
   eine Platzierung in eine leere Timeline ist per Definition
   richtig (`checkPlacement`), ein Buzz dagegen kann nicht gewinnen und würde nur
   einen Token verbrennen (`canBeChallenged`). Sonst gilt: nach dem Platzieren
   (Jahr noch maskiert) dürfen die anderen
   buzzen (−1★) und die Karte an die richtige Stelle "klauen" (Timer `buzzDeadline`),
   oder passen. Der Slot, in den der aktive Spieler gelegt hat, ist in der
   Challenge-Timeline markiert und **nicht wählbar** — dieselbe Lücke würde nach
   derselben Regel bewertet und damit garantiert verlieren. Falscher Buzz mit
   `penalty: "lose-point"` gibt eine DAUERHAFTE Strafe (`Player.penalties`,
   Score = Timeline-Länge − Penalties).
5. **Reveal:** Ergebnis + Song-Details (Cover, Album, 🅴, Deep-Cut/Banger-Badge),
   nächste Runde
6. **Finished:** Gewinner, ScoreBoard, Awards, Token-Bilanz + Runden-Log (aus
   `room.rounds` via `game-recap`), Link auf die Historie, Rematch-Option.
   Jede Runde im Log lässt sich aufklappen und zeigt dann ihre Ereignisse:
   verworfene Songs (`rerolls`), Guess mit Einzel-Verdikt, Platzierung mit Zeit,
   Passes, bitster samt Ausgang — jeweils mit der Token-Bewegung, die dazu
   gehört. Was in `RoundRecord` steht, ist die Wahrheit; die Bilanz pro Spieler
   wird daraus abgeleitet (`tokenLedger`), nie doppelt gespeichert.

## Game State Sync

```
Relay-Server (server.js, /ws):
  - Verwaltet Räume (create/join/rejoin/leave), vergibt Peer-IDs + Secret-Token
  - Leitet opake Messages weiter (to: "host" | "all" | <peerId>)
  - Meldet peer-joined/peer-left/host-down/room-closed
  - 60s Grace Period wenn der Host-Socket wegbricht, 15s Heartbeat
  - rejoin verlangt das Token: Peer-IDs sind im Raum öffentlich, sonst könnte
    jeder mit dem Raumcode die Host-Rolle übernehmen
  - KEINE Spiellogik

Host (p2p/host.ts, HostSession — läuft auf dem Host-Gerät):
  - Hält den kompletten Room-State, validiert JEDE Action (Authority)
  - Broadcastet buildGameState() an alle Peers, gestempelt mit hostNow +
    stateVersion
  - Besitzt die Timer: Buzz-Lock-in, Blitz-Placement, Disconnect-Grace (60s)
    und Turn-Grace (20s)
  - Hält Rundengeheimnisse privat: pendingResult (Platzierungs-Verdikt),
    pendingGuessResult/-By (Guess + Belohnung, angewendet erst beim Reveal)
  - Schreibt das Runden-Log (room.rounds) und broadcastet am Spielende EINMAL
    ein game-recap
  - Koordiniert Playback via StreamingProvider Interface (mock: URIs = still)

Peers (p2p/peer.ts):
  - Senden Actions an den Host (via Relay), akzeptieren game-state NUR vom Host
  - "connected" erst nach erstem game-state vom Host
  - Verwerfen game-states mit älterer stateVersion, rechnen Deadlines über den
    aus hostNow geschätzten clockOffsetMs um
  - Steuern eigenen StreamingProvider für lokalen Playback

Transport (p2p/connection.ts):
  - Socket-Lifecycle, Join-Handshake/-Retry, Reconnect-Backoff, dispatch()
  - resume() stellt nach einem Reload Rolle, Raum, Peer-ID und (beim Host) den
    kompletten Room aus dem Snapshot wieder her
  - dispatch(action, { as: localId }) ersetzt den Sender NUR auf dem Host-Gerät
    (Pass-and-Play) — Peers können nicht impersonaten

Wichtig: buildGameState() maskiert den aktuellen Song im Broadcast, solange
geraten wird — der Payload IST die Antwort. Was maskiert wird, steht in
`src/schema/song.ts` (`secret`-Flag pro Feld); zusätzlich fliegt der Song aus
playedSongs, und `room.rounds` ist im Broadcast NIE enthalten. currentSongUri
bleibt drin (Peers brauchen sie zum Abspielen) — Maskierung schützt in-App,
nicht gegen modifizierte Clients.

Ein Socket-Abriss ist KEIN Ausscheiden: der Spieler wird `connected: false`
markiert und behält Sitz, Timeline und Tokens, bis die Grace abläuft. Nur ein
bewusstes Verlassen (Leave-Button) beendet die Mitgliedschaft sofort.
```

## Commands

```bash
# Development
node server.js 8090               # Relay-Server lokal (Port aus .env.development)
npx expo start                    # Dev Server (Metro)
npx expo start --web              # Web-Version
npx expo run:ios                  # iOS Simulator
npx expo run:android              # Android Emulator

# Build
eas build --platform ios          # iOS Build
eas build --platform android      # Android Build

# Tests + Typecheck (kein ESLint im Projekt)
npx vitest run                    # Unit Tests
npx vitest --coverage             # Coverage
npx tsc --noEmit                  # Type Check
```

## Wichtige Abhängigkeiten

| Package                     | Zweck                                          |
| --------------------------- | ---------------------------------------------- |
| expo / expo-router          | App Framework + File-based Navigation          |
| expo-auth-session           | Streaming Provider OAuth (PKCE)                |
| expo-secure-store           | Token-Speicherung (nativ; Web: localStorage)   |
| @react-native-async-storage | UI-Settings-Persistenz (Theme, Effekte)        |
| expo-haptics / -clipboard / -sharing / -file-system | Haptik, Copy, Log-Export |
| @expo-google-fonts/bebas-neue + assets/fonts | Display- und UI-Fonts (lokal) |
| ws                          | WebSocket-Server für den Relay (nur server.js) |
| zustand                     | State Management                               |

## Architektur-Regeln

- **Game Logic ist provider-agnostisch.** `game/logic.ts` kennt nur `Track`/`Song`, nie `SpotifyTrack`.
  Provider-spezifische Daten werden beim Import auf `Track` gemappt.
- **Stores importieren keine anderen Stores.** Orchestrierung passiert in `p2p/host.ts` / `p2p/peer.ts`.
- **`game/logic.ts` bleibt pur.** Room→Room-Funktionen ohne I/O; Phase-Treiber, Timer und
  Rundengeheimnisse leben in `HostSession`.
- **Der Relay-Server bleibt dumm.** Keine Spiellogik in `server.js` — nur Räume + Message-Weiterleitung.
- **Neue Provider = neuer Ordner unter `streaming/providers/`.** Kein bestehender Code muss sich ändern.
  Provider registriert sich in `registry.ts`, fertig.
- **Components unter `ui/` haben keine Business-Logik.** Nur Props rein, JSX raus.
  Game/Lobby/Streaming Components dürfen Stores und Hooks nutzen.
- **Ein Hook pro Concern.** Kein God-Hook der alles kann.

## Nicht vergessen

- Jeder Streaming-Provider braucht registrierte Redirect URIs im jeweiligen Developer Dashboard
- Deep Links für Auth Callback: `bitster://auth/callback` (native) / `https://domain/auth/callback` (web) — eine Route (`app/auth/callback.tsx`) für beide
- **Spotify Development Mode:** dokumentiert sind inzwischen **5 Nutzer** (früher 25 —
  Bestands-Apps sind laut Migration-Guide möglicherweise großväterlich drin, verlassen
  sollte man sich darauf nicht). Jeder Spieler-Account muss im Spotify
  Developer Dashboard unter "User Management" eingetragen sein — sonst 403 nach dem Login!
  Es zählt die exakte Mail des Spotify-Accounts (bei Duo/Family bzw. Google/Facebook-Signup
  oft nicht die erwartete) — der "Spotify check" in der App zeigt den verbundenen Account.
- **Spotify Web-API-Migration (Feb/März 2026):** Für Development-Mode-Apps wurden Endpoints
  umbenannt/beschnitten; alte Endpoints antworten seit 09.03.2026 mit **403 und leerem Body**.
  Relevant für uns: `GET /playlists/{id}/tracks` → `GET /playlists/{id}/items` (Entry-Feld
  heißt `item` statt `track`), Playlist-Feld `tracks` → `items`, und `items` gibt es nur noch
  für eigene/kollaborative Playlists (fremde liefern nur Metadaten). `GET /me` kann trotz
  gültigem Token nackt 403en, während Player-Endpoints funktionieren — Diagnose darf daran
  nicht abbrechen. Außerdem braucht der App-Owner-Account laut Spotify aktives Premium.
  Migration Guide: developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- **Weitere Feld-Entfernungen aus derselben Migration (Dev Mode):** `popularity` ist vom
  Track-Objekt verschwunden — davon hängen die Deep-Cut/Banger-Badges im Reveal ab, die
  dadurch vermutlich längst nicht mehr erscheinen. Ebenso `product`/`country`/`email` vom
  User-Objekt, weshalb der "Spotify check" den Tarif nicht mehr lesen kann. Ob die Felder
  wirklich fehlen, misst `getFieldPresence()` in `songMapping.ts` im laufenden Betrieb —
  nicht raten, die Zähler nach einem Spieleabend anschauen.
- **`is_playable` ist optional und der Filter bewusst fail-open.** Fehlt das Feld, wird
  NICHT gefiltert; fail-closed würde jeden Track ablehnen und jedes Spiel sofort beenden.
  Verfügbarkeit gilt außerdem immer nur für den Account, der abgefragt hat — der Host kann
  nicht wissen, ob ein Song bei den Mitspielern läuft (`restrictions.reason: "explicit"`
  ist sogar eine reine Konto-Einstellung).
- **Spotify Redirect-URIs (seit Nov 2025):** nur HTTPS oder Loopback-IP erlaubt, `localhost`
  wird abgelehnt. Web-Dev deshalb über `http://127.0.0.1:5173` öffnen und
  `http://127.0.0.1:5173/auth/callback` im Dashboard registrieren (Login wirft sonst eine
  entsprechende Fehlermeldung).
- Nativ braucht der Client `EXPO_PUBLIC_RELAY_URL` (Web nimmt automatisch den eigenen Origin)
- Das Dockerfile kopiert `node_modules/ws` explizit ins Runtime-Image (kein npm ci dort)
- iOS: Background Audio läuft über die jeweilige Streaming-App, nicht über die bitster-App
- Rate Limits: Streaming API Calls bündeln, nicht bei jedem State-Update
- Neuen Provider hinzufügen: `StreamingProvider` implementieren, in `registry.ts` registrieren
  (`listProviders()` existiert schon; ein ProviderPicker-UI fehlt noch — bis dahin hardcodet `app/index.tsx` Spotify)
