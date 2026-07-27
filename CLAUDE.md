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

### Aktuell (wird migriert)

- Client: React 18 + Vite + React Router
- Server: Express + Socket.IO + spotify-web-api-node
- Auth: Server-side Spotify OAuth
- Playback: Spotify Web Playback SDK

### Ziel-Stack

- **App:** React Native (Expo) — iOS, Android, Web
- **Multiplayer:** WebSocket-Relay auf dem Railway-Server (`server.js` + `ws`), Host-Peer als Game Authority
- **Auth:** Provider-spezifisch, client-only (Spotify PKCE, etc.)
- **Playback:** Provider-spezifisch (Spotify Remote Control, etc.)
- **State:** Zustand (ersetzt useReducer + Context)
- **Navigation:** Expo Router
- **Storage:** expo-secure-store (Tokens), AsyncStorage (Preferences)

## Projektstruktur (Ziel)

```
app/                          # Expo Router screens
  (tabs)/
    index.tsx                 # Home – Create/Join Room
    game.tsx                  # Game Screen
  _layout.tsx                 # Root Layout
  callback.tsx                # Streaming Auth Callback (Deep Link)

src/
  streaming/                  # === Streaming Provider Abstraction ===
    types.ts                  # StreamingProvider Interface + shared types
    registry.ts               # Provider Registration + aktiven Provider holen
    store.ts                  # Zustand – Provider State, Tokens, aktives Gerät
    providers/
      spotify/
        auth.ts               # Spotify PKCE Flow
        player.ts             # Spotify Remote Control (Play/Pause/Seek)
        playlist.ts           # Spotify Playlist Fetching
        index.ts              # Exportiert SpotifyProvider (implements StreamingProvider)
      # apple-music/          # Zukünftig
      # youtube-music/        # Zukünftig

  p2p/                        # === Multiplayer Communication Layer ===
    connection.ts             # WebSocket-Relay-Client + Host/Peer-Logik
    protocol.ts               # Message Types (discriminated unions)
    store.ts                  # Zustand – Connection State, Peer List

  game/                       # === Pure Game Logic (kein UI, kein I/O) ===
    logic.ts                  # checkPlacement, advanceTurn, checkWin, pickSong
    types.ts                  # Room, Player, Song, Phase, GameSettings
    store.ts                  # Zustand – Game State (Phase, Scores, Timelines)

  components/                 # === UI Components ===
    ui/                       # Primitive Bausteine (Button, Input, Badge, BottomSheet)
      Button.tsx
      Input.tsx
      Badge.tsx
      BottomSheet.tsx
      StatusDot.tsx
    game/                     # Game-Phase Components
      Timeline.tsx
      TimelineCard.tsx
      TimelineGap.tsx
      PlayerList.tsx
      RevealCard.tsx
      NowPlaying.tsx
      ScoreBoard.tsx
    lobby/                    # Lobby Components
      RoomCode.tsx
      GameSettings.tsx
      PlayerSlot.tsx
    streaming/                # Streaming-Provider UI
      ProviderPicker.tsx      # Provider auswählen (Spotify, Apple Music, ...)
      ConnectButton.tsx       # Login-Button für aktiven Provider
      DeviceSelector.tsx      # Aktives Gerät auswählen

  hooks/                      # === Custom Hooks ===
    useHaptics.ts             # Haptic Feedback (success, error, tap)
    useConnectionStatus.ts    # P2P Connection State als Hook
    useCurrentPlayer.ts       # Bin ich dran? Meine Timeline, etc.

  utils/
    roomCode.ts               # Code Generation + Validation
    constants.ts              # App-weite Konstanten

assets/                       # Icons, Splash Screen, Fonts
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
  getPlaylistTracks(playlistId: string): Promise<Track[]>;
  parsePlaylistUrl(url: string): string | null;
  getPlaylistMeta(playlistId: string): Promise<PlaylistMeta>;
}

// Provider-agnostischer Track — das benutzt die Game Logic
interface Track {
  id: string; // Provider-spezifische ID
  uri: string; // Provider-spezifische URI
  name: string;
  artist: string;
  year: number;
}
```

### Store-Aufteilung

Drei Stores statt einem monolithischen:

| Store                | Verantwortung                                   | Zugriff                  |
| -------------------- | ----------------------------------------------- | ------------------------ |
| `game/store.ts`      | Phase, Scores, Timelines, CurrentSong, Settings | Überall                  |
| `streaming/store.ts` | Aktiver Provider, Auth State, Token, Gerät      | Streaming UI, Host       |
| `p2p/store.ts`       | Connection Status, Peer List, eigene Peer ID    | Connection UI, Host/Peer |

Stores sind unabhängig — kein Store importiert einen anderen.
Orchestrierung läuft über `host.ts` / `peer.ts` die alle drei Stores lesen/schreiben.

## Arbeitsweise

Dieses Projekt wird **vollständig KI-gestützt** entwickelt. Keine manuellen Zeitschätzungen — wir iterieren Phase für Phase, so schnell wie der Output es erlaubt.

## Konventionen

- **Sprache:** Code + Kommentare auf Englisch, Docs auf Deutsch
- **TypeScript:** Strikt. Keine `any`, keine impliziten Typen
- **State:** Zustand Stores, kein Context/useReducer für globalen State
- **Styling:** NativeWind (Tailwind für React Native) oder StyleSheet.create
- **Naming:** camelCase für Variablen/Funktionen, PascalCase für Komponenten/Typen
- **Dateien:** Komponenten .tsx, Logic .ts, keine .jsx/.js
- **Imports:** Absolute Imports via `@/` Alias (src/)
- **Tests:** Vitest für Logic, React Native Testing Library für Components
- **P2P Messages:** Typisierte Actions mit discriminated unions

## Spielablauf

1. **Home:** Spieler gibt Namen ein, erstellt oder joint Raum (6-Zeichen-Code)
2. **Lobby:** Host gibt Spotify-Playlist ein, alle connecten Spotify via PKCE.
   Host kann zusätzlich **lokale Spieler** anlegen (Pass-and-Play am Host-Gerät,
   `Player.isLocal`); das Host-Gerät steuert deren Züge/Buzzes via `dispatch(action, { as: localId })`.
   Online-Peers können keine lokalen Spieler haben.
3. **Playing:** Song spielt auf allen Geräten, aktiver Spieler platziert in Timeline
4. **Reveal:** Ergebnis wird gezeigt (richtig/falsch), nächste Runde
5. **Finished:** Gewinner wird angezeigt, Rematch-Option

## Game State Sync

```
Relay-Server (server.js, /ws):
  - Verwaltet Räume (create/join/rejoin/leave), vergibt Peer-IDs
  - Leitet opake Messages weiter (to: "host" | "all" | <peerId>)
  - Meldet peer-joined/peer-left/host-down/room-closed
  - 30s Grace Period wenn der Host-Socket wegbricht
  - KEINE Spiellogik

Host-Peer (p2p/connection.ts, role="host"):
  - Hält kompletten GameState (hostRoom)
  - Validiert Aktionen (place-song, bitster-buzz, ...)
  - Broadcastet State-Updates an alle Peers
  - Koordiniert Playback via StreamingProvider Interface

Peers (p2p/connection.ts, role="peer"):
  - Senden Actions an den Host (via Relay)
  - Akzeptieren game-state NUR vom Host-Peer
  - "connected" erst nach erstem game-state vom Host
  - Steuern eigenen StreamingProvider für lokalen Playback

Wichtig: buildGameState() maskiert den aktuellen Song im Broadcast
(playedSongs + Jahr), solange geraten wird — der Payload IST die Antwort.

Orchestrierung:
  connection.ts liest und schreibt in alle drei Stores
  (game/store, streaming/store, p2p/store).
  Stores kennen sich gegenseitig nicht.
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

# Tests
npx vitest                        # Unit Tests
npx vitest --coverage             # Coverage

# Lint
npx eslint . --fix
npx tsc --noEmit                  # Type Check
```

## Wichtige Abhängigkeiten

| Package            | Zweck                                          |
| ------------------ | ---------------------------------------------- |
| expo               | App Framework                                  |
| expo-router        | File-based Navigation                          |
| expo-secure-store  | Sichere Token-Speicherung                      |
| expo-auth-session  | Streaming Provider OAuth                       |
| ws                 | WebSocket-Server für den Relay (nur server.js) |
| zustand            | State Management                               |
| nativewind         | Tailwind CSS für RN                            |
| @expo/vector-icons | Icons                                          |

## Architektur-Regeln

- **Game Logic ist provider-agnostisch.** `game/logic.ts` kennt nur `Track`, nie `SpotifyTrack`.
  Provider-spezifische Daten werden beim Import auf `Track` gemappt.
- **Stores importieren keine anderen Stores.** Orchestrierung passiert in `p2p/connection.ts`.
- **Der Relay-Server bleibt dumm.** Keine Spiellogik in `server.js` — nur Räume + Message-Weiterleitung.
- **Neue Provider = neuer Ordner unter `streaming/providers/`.** Kein bestehender Code muss sich ändern.
  Provider registriert sich in `registry.ts`, fertig.
- **Components unter `ui/` haben keine Business-Logik.** Nur Props rein, JSX raus.
  Game/Lobby/Streaming Components dürfen Stores und Hooks nutzen.
- **Ein Hook pro Concern.** Kein God-Hook der alles kann.

## Nicht vergessen

- Jeder Streaming-Provider braucht registrierte Redirect URIs im jeweiligen Developer Dashboard
- Deep Links für Auth Callback: `bitster://auth/callback` (native) / `https://domain/auth/callback` (web) — eine Route (`app/auth/callback.tsx`) für beide
- **Spotify Development Mode:** max. 25 Nutzer, jeder Spieler-Account muss im Spotify
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
- **Spotify Redirect-URIs (seit Nov 2025):** nur HTTPS oder Loopback-IP erlaubt, `localhost`
  wird abgelehnt. Web-Dev deshalb über `http://127.0.0.1:5173` öffnen und
  `http://127.0.0.1:5173/auth/callback` im Dashboard registrieren (Login wirft sonst eine
  entsprechende Fehlermeldung).
- Nativ braucht der Client `EXPO_PUBLIC_RELAY_URL` (Web nimmt automatisch den eigenen Origin)
- Das Dockerfile kopiert `node_modules/ws` explizit ins Runtime-Image (kein npm ci dort)
- iOS: Background Audio läuft über die jeweilige Streaming-App, nicht über die bitster-App
- Rate Limits: Streaming API Calls bündeln, nicht bei jedem State-Update
- Neuen Provider hinzufügen: `StreamingProvider` implementieren, in `registry.ts` registrieren, `ProviderPicker` zeigt ihn automatisch
