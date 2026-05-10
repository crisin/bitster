# Implementierungsplan: Hitster P2P Mobile App

## Überblick

Migration von Client-Server (Express/Socket.IO) zu einer serverlosen P2P-App
mit React Native (Expo) für iOS, Android und Web.

**6 Phasen, jede Phase ist ein funktionierender Meilenstein.**

---

## Phase 1: Expo Projekt + Core Types + Game Logic

**Ziel:** Expo-Projekt aufsetzen, Game-Logik aus dem Server extrahieren und typisiert neu schreiben.

### 1.1 Expo Projekt initialisieren
```bash
npx create-expo-app hitster --template expo-template-blank-typescript
```
- Expo Router einrichten (file-based routing)
- NativeWind konfigurieren (Tailwind für RN)
- Absolute Imports (`@/`) via tsconfig paths
- ESLint + Prettier Setup

### 1.2 Core Types definieren
Aus `server/src/services/gameManager.js` extrahieren und typisieren:
```typescript
// src/game/types.ts
type Phase = 'lobby' | 'playing' | 'reveal' | 'finished'
type Song = { name: string; artist: string; year: number; uri: string }
type Player = { id: string; name: string; score: number; timeline: Song[] }
type GameSettings = { winScore: number; maxPlayers: number }
type Room = {
  code: string; hostId: string; players: Player[]
  playlist: Song[]; playedSongs: Song[]
  currentPlayerIndex: number; currentSong: Song | null
  phase: Phase; settings: GameSettings
}
```

### 1.3 Game Logic extrahieren
Pure Functions aus `gameManager.js` in `src/game/logic.ts`:
- `checkPlacement(timeline: Song[], song: Song, position: number): boolean`
- `advanceTurn(room: Room): Room`
- `checkWinCondition(room: Room): Player | null`
- `pickRandomSong(room: Room): { room: Room; song: Song } | null`
- `generateRoomCode(): string`

**Unit Tests** für jede Funktion in `src/game/logic.test.ts`.

### 1.4 Zustand Stores
- `src/stores/gameStore.ts` — Game State (ersetzt GameContext.jsx)
- `src/stores/authStore.ts` — Spotify Tokens + Auth State

**Lieferbar:** Expo-Projekt kompiliert, Game-Logik getestet, Types definiert.

---

## Phase 2: Streaming Provider Abstraction + Spotify

**Ziel:** Provider-agnostische Streaming-Schicht aufbauen, Spotify als ersten Provider implementieren.

### 2.1 Streaming Interface definieren
`src/streaming/types.ts`:
```typescript
interface StreamingProvider {
  id: string                  // 'spotify' | 'apple-music' | ...
  name: string                // 'Spotify'
  color: string               // Brand Color für UI
  auth: StreamingAuth
  player: StreamingPlayer
  library: StreamingLibrary
}

interface StreamingAuth {
  login(): Promise<void>
  logout(): Promise<void>
  isAuthenticated(): boolean
  refreshToken(): Promise<void>
}

interface StreamingPlayer {
  play(trackUri: string): Promise<void>
  pause(): Promise<void>
  getDevices(): Promise<StreamingDevice[]>
  setDevice(deviceId: string): Promise<void>
}

interface StreamingLibrary {
  getPlaylistTracks(playlistId: string): Promise<Track[]>
  parsePlaylistUrl(url: string): string | null
}
```

### 2.2 Provider Registry
`src/streaming/registry.ts`:
```typescript
// Alle Provider registrieren sich hier
// getProvider(id) → StreamingProvider
// getActiveProvider() → aktuell ausgewählter Provider
// listProviders() → alle verfügbaren Provider
```

### 2.3 Streaming Store
`src/streaming/store.ts` — Provider-agnostischer Zustand:
- Aktiver Provider (ID)
- Auth State (authenticated / unauthenticated / loading)
- Token Expiry + Auto-Refresh Timer
- Aktives Gerät
- Tokens in `expo-secure-store` (native) / `localStorage` (web)

### 2.4 Spotify Provider implementieren
`src/streaming/providers/spotify/`:
- `auth.ts` — PKCE Flow (expo-auth-session)
- `player.ts` — Spotify Web API Remote Control
- `playlist.ts` — Playlist Fetching + Track Mapping auf `Track`
- `index.ts` — Exportiert `SpotifyProvider` (implements `StreamingProvider`)

Spotify Dashboard Setup:
- Redirect URIs: `hitster://callback`, `http://localhost:8081/callback`, `https://hitster.app/callback`
- Scopes: `user-modify-playback-state user-read-playback-state`

### 2.5 Auth + Playback UI
- `ProviderPicker.tsx` — Provider auswählen (erstmal nur Spotify, aber vorbereitet)
- `ConnectButton.tsx` — Login für aktiven Provider
- `DeviceSelector.tsx` — Gerät auswählen wenn mehrere aktiv
- Callback Screen als Deep Link Handler

### 2.6 Playback + Playlist
Remote Control via Provider Interface:
- Play/Pause/Seek über `StreamingPlayer`
- Playlist Import über `StreamingLibrary`
- Device Selection über `StreamingPlayer.getDevices()`

Error Handling (provider-agnostisch):
- Token abgelaufen → `auth.refreshToken()` automatisch
- Kein aktives Gerät → User-Prompt via `DeviceSelector`
- Premium erforderlich → Fehlermeldung vom Provider
- Rate Limiting → Retry mit Backoff

**Lieferbar:** Streaming-Abstraktion steht, Spotify funktioniert komplett (Auth + Playback + Playlist).
Neuer Provider = neuer Ordner, Interface implementieren, in Registry registrieren.

---

## Phase 3: P2P mit Trystero (WebRTC)

**Ziel:** Spieler verbinden sich direkt über WebRTC, kein Server dazwischen.

### 3.1 Firebase Projekt aufsetzen
- Firebase Realtime Database (Spark/Free Plan)
- Nur als Signaling-Kanal für WebRTC
- Firewall Rules: nur Lesen/Schreiben auf Signaling-Pfade

### 3.2 Trystero Integration
`src/p2p/connection.ts`:
```typescript
import { joinRoom } from 'trystero/firebase'

const config = {
  appId: 'hitster-p2p',
  firebaseApp: firebaseConfig,
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // TURN-Server für mobile Carrier-NATs
    ]
  }
}
```

### 3.3 P2P Protocol
`src/p2p/protocol.ts` — Typisierte Actions:
```typescript
type P2PAction =
  | { type: 'join'; payload: { name: string } }
  | { type: 'game-state'; payload: GameState }
  | { type: 'place-song'; payload: { position: number } }
  | { type: 'hitster-buzz'; payload: { position: number } }
  | { type: 'next-round' }
  | { type: 'start-game'; payload: { playlistUrl: string } }
  | { type: 'play-song'; payload: { uri: string } }
  | { type: 'kick-player'; payload: { playerId: string } }
```

### 3.4 Host Logic
`src/p2p/host.ts` — GameManager als Host-Peer:
- Room State halten
- Actions von Peers validieren
- State-Updates broadcasten
- Spotify Playback für alle koordinieren

### 3.5 Peer Logic
`src/p2p/peer.ts`:
- Actions an Host senden
- State-Updates empfangen und in Zustand Store schreiben
- Reconnect-Handling bei Verbindungsabbruch

### 3.6 Connection UX + P2P Store
- Room-Code anzeigen + Copy-Button
- QR-Code generieren (für "alle im selben Raum")
- Share-Link via native Share API
- Verbindungsstatus-Anzeige (connecting/connected/error)
- Peer-Count Indikator

**Lieferbar:** Spieler können sich P2P verbinden, Messages werden ausgetauscht.

---

## Phase 4: Game UI (React Native)

**Ziel:** Komplettes Game UI in React Native, optimiert für Mobile.
Fokus auf Robustheit und Benutzbarkeit — funktionieren vor gut aussehen.

### 4.1 Screens (Expo Router)

**Home Screen** (`app/(tabs)/index.tsx`):
- Spielername (persistiert)
- "Create Room" / "Join Room" Toggle
- Room-Code Input (Join)
- Spotify Login Status

**Game Screen** (`app/(tabs)/game.tsx`):
- Dynamisch je nach Phase:
  - Lobby: Spielerliste, Playlist-Input (Host), Warten
  - Playing: Timeline + Song-Platzierung
  - Reveal: Ergebnis-Animation
  - Finished: Gewinner + Rematch

### 4.2 Komponenten

**Timeline** (`src/components/Timeline.tsx`):
- Horizontaler ScrollView
- Karten mit Jahr + Song-Info
- Touch-Targets für Platzierung (größer als Web-Version)
- Haptic Feedback bei Platzierung
- Drag & Drop Option (react-native-gesture-handler)

**PlayerList** (`src/components/PlayerList.tsx`):
- Spieler mit Scores
- Aktiver Spieler hervorgehoben
- Host-Badge
- Online/Offline-Status

**Lobby** (`src/components/Lobby.tsx`):
- Room-Code groß + Copy/Share
- QR-Code
- Spielerliste (wer connected ist)
- Playlist-URL Input (Host only)
- Game Settings (winScore, maxPlayers)
- "Start Game" Button (Host only)

**RevealCard** (`src/components/RevealCard.tsx`):
- Flip-Animation (Song-Reveal)
- Richtig/Falsch-Feedback
- Song-Info (Name, Artist, Jahr)
- "Next Round" Button

### 4.3 Styling
- Dark Theme (wie aktuelle CSS, portiert zu NativeWind)
- Responsive: Phone (primary) + Tablet + Web
- Safe Area Handling (Notch, Home Indicator)
- Keyboard Avoidance für Inputs

### 4.4 UX Features aus TODO.md
- Platzierung bestätigen (nicht sofort bei Tap)
- Gegner-Timelines ansehen (read-only)
- Loading States überall
- Error Boundary mit Crash-Recovery
- Bessere Fehlermeldungen

**Lieferbar:** Komplettes Spiel spielbar auf iOS/Android/Web.

---

## UI/UX Referenz — Robuste Mobile-First Implementierung

Dieser Abschnitt definiert konkrete UI-Patterns für die Implementierung.
Priorität: **funktioniert zuverlässig auf jedem Gerät** > sieht gut aus.

### Layout-Architektur

Die Web-Version nutzt ein Sidebar-Layout (240px Sidebar + Main). Das funktioniert
auf Phones nicht. Mobile-Layout ist komplett anders:

**Phone (< 768px) — Single Column, Full Screen pro Phase:**

```
┌──────────────────────────┐
│ Header: HITSTER | XKCD42 │  ← Fixed, 56px, immer sichtbar
├──────────────────────────┤
│                          │
│   Phase-spezifischer     │
│   Content (scrollbar)    │
│                          │
│                          │
├──────────────────────────┤
│ Bottom Bar: Action(s)    │  ← Fixed, kontextabhängig
└──────────────────────────┘
```

- **Header:** Kompakt. Logo links, Room-Code rechts (tappbar → kopiert).
  Connection-Status als farbiger Dot (grün/gelb/rot) neben dem Code.
- **Bottom Bar:** Kontextabhängig pro Phase. Immer über der Tastatur.
  In der `playing`-Phase: Confirm-Button. In `reveal`: Next Round.
  In `lobby`: Start Game (Host) oder Warten-Text (Peer).
- **Content Area:** Scrollbar, nimmt den gesamten Rest-Platz ein.
  Kein horizontales Scrollen außer in der Timeline selbst.

**Tablet / Web (>= 768px):**

Sidebar-Layout wie gehabt, aber Sidebar wird zum Bottom Sheet wenn
der Platz knapp wird. Keine harten Breakpoints — `flex-wrap` nutzen.

### Screen: Home

```
┌────────────────────────┐
│                        │
│        HITSTER         │  ← Groß, zentriert
│                        │
│  ┌──────────────────┐  │
│  │  Dein Name       │  │  ← Auto-Focus, persistiert in Storage
│  └──────────────────┘  │
│                        │
│  ┌──────┐  ┌────────┐  │
│  │Create│  │  Join  │  │  ← Gleich groß, Toggle-Verhalten
│  └──────┘  └────────┘  │
│                        │
│  ┌──────────────────┐  │  ← Nur sichtbar wenn "Join" aktiv
│  │  Room Code       │  │     monospace, uppercase, 6 Zeichen
│  └──────────────────┘  │
│                        │
│  ┌──────────────────┐  │
│  │   Los geht's     │  │  ← Disabled bis Name + (Code) ausgefüllt
│  └──────────────────┘  │
│                        │
│  🟢 Spotify connected  │  ← Oder "Connect Spotify" Button
│                        │
└────────────────────────┘
```

- **Name Input:** `autoFocus`, 2-20 Zeichen, kein Submit bei leer.
  Wert aus AsyncStorage laden beim Mount. Bei Änderung sofort speichern.
- **Room Code Input:** `maxLength={6}`, `autoCapitalize="characters"`,
  monospace Font, `letterSpacing: 8`. Nur A-Z + 0-9 erlauben via `onChangeText` Filter.
- **Create/Join Toggle:** Kein Tab-Bar, sondern zwei Buttons nebeneinander.
  Aktiver Button hat Akzentfarbe, inaktiver ist ghost/outline.
- **Spotify Status:** Unten, nicht prominent. Grüner Dot + Text wenn connected.
  Falls nicht: Spotify-grüner Button. Kein Blocker für Room-Erstellung.
- **Error States:** Inline unter dem jeweiligen Input, rote Schrift.
  "Room not found", "Room is full", "Name is taken".
- **Loading:** Button zeigt Spinner + "Connecting..." text, disabled.

### Screen: Lobby

```
┌────────────────────────┐
│ HITSTER        XKCD42 🟢│
├────────────────────────┤
│                        │
│      Room Code:        │
│     ┌──────────┐       │
│     │ XKCD42   │ 📋 📤 │  ← Groß, Copy + Share Buttons
│     └──────────┘       │
│                        │
│   Spieler (3/8):       │
│   ┌──────────────────┐ │
│   │ 👑 Chris     🟢  │ │  ← Host-Crown, Connection-Dot
│   │    Max       🟢  │ │
│   │    Lisa      🟡  │ │  ← Gelb = connecting
│   └──────────────────┘ │
│                        │
│  ┌──────────────────┐  │  ← Nur für Host
│  │ Playlist URL     │  │
│  └──────────────────┘  │
│                        │
├────────────────────────┤
│  ┌──────────────────┐  │  ← Bottom Bar
│  │   Start Game     │  │     Host: Start. Peers: "Waiting..."
│  └──────────────────┘  │
└────────────────────────┘
```

- **Room Code:** Riesig (32px+), monospace, letter-spacing.
  Copy-Button kopiert Code, Share-Button öffnet native Share Sheet
  mit Text "Spiel mit mir Hitster! Code: XKCD42" + Deep Link.
- **Spielerliste:** Jeder Spieler eine Zeile. Host hat Crown-Icon.
  Connection-Status als Dot: 🟢 connected, 🟡 connecting, 🔴 disconnected.
  Kein Scrolling nötig (max 8 Spieler).
- **Host Controls:** Playlist-URL Input + Start Button.
  Start Button disabled bis: Playlist eingegeben UND mindestens 2 Spieler
  UND Host hat Spotify connected. Klare Disabled-Reasons als Text unter Button:
  "Need at least 2 players", "Enter a playlist first", "Connect Spotify first".
- **Peer View:** Statt Controls nur: "Waiting for host to start..."
  mit einem subtilen Puls-Indicator.
- **QR Code:** Optional, hinter einem "Show QR" Toggle. Nicht standardmäßig
  sichtbar — spart Platz und die meisten teilen per Code/Link.

### Screen: Playing

```
┌────────────────────────┐
│ HITSTER        XKCD42 🟢│
├────────────────────────┤
│                        │
│   🎵 Song playing...   │  ← Audio-Bars Animation
│                        │
│   ┌─ Your Timeline ──┐ │
│   │                   │ │
│   │ [+] 1987 [+] 2004│◄├── Horizontal scroll
│   │      ↑        ↑   │ │
│   │     Song1   Song2  │ │
│   │                   │ │
│   └───────────────────┘ │
│                        │
│   Players:             │
│   ▸ Chris (3) ← dran  │  ← Kompakt, eine Zeile pro Spieler
│     Max (2)            │
│     Lisa (1)           │
│                        │
├────────────────────────┤
│  ┌──────────────────┐  │  ← Nur sichtbar nach Gap-Tap
│  │  Place Here ✓    │  │     Confirm-Button
│  └──────────────────┘  │
└────────────────────────┘
```

**Timeline — das kritischste UI-Element:**

- **Richtung:** Horizontal scrollbar, links = älteste Songs, rechts = neueste.
- **Karten:** Mindestbreite 100px, zeigen Jahr (groß, 24px) + Songtitel (klein, 12px,
  truncated) + Artist (klein, 11px, truncated). Feste Höhe 100px.
- **Gaps (Platzierungszonen):** Mindestens **56x80px** Touch-Target (Apple HIG: 44px min).
  Dashed Border + "+" Icon. Im Ruhezustand 40% Opacity, bei Hover/Active 100%.
- **Platzierung — Zwei-Schritt-Confirm:**
  1. Tap auf Gap → Gap wird hervorgehoben (Akzentfarbe-Background),
     alle anderen Gaps bleiben sichtbar aber gedimmt.
     Bottom Bar zeigt "Place Here ✓" Button.
  2. Tap auf Confirm → Song wird platziert, Confirm verschwindet.
  3. Tap auf anderen Gap → Selection wechselt (kein Confirm nötig zum Wechseln).
  4. Tap irgendwo anders → Deselect, Confirm verschwindet.
  Das verhindert Fehlplatzierungen. Kein `alert()`, kein Modal.
- **Scroll-Verhalten:** Bei neuem Song automatisch zur Mitte scrollen.
  `scrollToIndex` mit Animation. User kann frei scrollen danach.
- **Leere Timeline:** Einzelner großer Gap in der Mitte: "Tap to place your first song".
  Kein Confirm nötig beim ersten Song (es gibt nur eine Position).
- **Fremde Timelines:** Nicht standardmäßig sichtbar. Über Tap auf
  einen Spielernamen in der PlayerList öffnet sich ein Bottom Sheet
  mit der read-only Timeline des Spielers. Dismiss per Swipe-Down.
- **Nicht mein Zug:** Timeline read-only (keine Gaps). Text oben:
  "[Name] is placing a song..." — kein Interaktionsblocker-Overlay,
  einfach keine interaktiven Elemente.

**Now Playing Indicator:**

- Kompakter Balken oben im Content-Bereich (nicht im Header).
- Audio-Bars Animation (4 Balken, CSS-only) + "Song playing..." Text.
- Kein Songtitel (der soll ja geraten werden).
- Wenn Playback fehlschlägt: Roter Text "Playback failed — open Spotify"
  mit Retry-Button.

**Player List (Playing Phase):**

- Kompakt, unter der Timeline. Eine Zeile pro Spieler:
  `Name (Score)` — aktiver Spieler fett + Akzentfarbe + "← dran".
- Tappbar → öffnet Bottom Sheet mit deren Timeline.
- Kein separater Sidebar nötig auf Mobile.

### Screen: Reveal

```
┌────────────────────────┐
│ HITSTER        XKCD42 🟢│
├────────────────────────┤
│                        │
│     ┌──────────────┐   │
│     │   Correct!   │   │  ← Grün-Border oder Rot-Border
│     │              │   │
│     │  Song Title   │   │
│     │  Artist Name  │   │
│     │    2003       │   │  ← Jahr groß + Akzentfarbe
│     └──────────────┘   │
│                        │
│   ┌─ Your Timeline ──┐ │
│   │ 1987 [2003] 2004 │◄├── Neu platzierter Song hervorgehoben
│   └───────────────────┘ │
│                        │
├────────────────────────┤
│  ┌──────────────────┐  │
│  │   Next Round →   │  │  ← Alle Spieler sehen diesen Button
│  └──────────────────┘  │
└────────────────────────┘
```

- **Reveal Card:** Zentriert, nimmt ~40% des Screens ein.
  Korrekt: grüner Border + grüner Header-Text.
  Falsch: roter Border + roter Header-Text.
  Keine aufwändige Animation in v1 — ein simples `opacity 0→1` reicht.
- **Song Info:** Titel (18px, bold), Artist (16px, secondary color), Jahr (32px, accent, bold).
- **Updated Timeline:** Unter der Reveal Card. Neu platzierter Song hat
  einen farbigen Ring/Glow (grün wenn korrekt, rot wenn falsch), damit
  man sieht wo er gelandet ist.
- **Next Round Button:** In der Bottom Bar, jeder Spieler kann drücken.
  Nur der erste Tap zählt (Server/Host ignoriert Duplikate).
  Button disabled + "Waiting..." nach Tap, bis nächste Runde startet.

### Screen: Finished

```
┌────────────────────────┐
│ HITSTER        XKCD42 🟢│
├────────────────────────┤
│                        │
│       Game Over!       │
│                        │
│     🏆 Chris wins!     │  ← Oder "You win!" wenn self
│                        │
│   Final Scores:        │
│   1. Chris — 10        │
│   2. Max — 7           │
│   3. Lisa — 4          │
│                        │
├────────────────────────┤
│  ┌──────┐ ┌──────────┐ │
│  │ Home │ │ Rematch  │ │  ← Zwei Buttons
│  └──────┘ └──────────┘ │
└────────────────────────┘
```

- **Scoreboard:** Sortiert nach Score, absteigend. Gewinner hat Crown-Icon.
  Eigener Name hervorgehoben.
- **Rematch:** Gleicher Room, gleiche Spieler, neues Spiel.
  Host wählt neue Playlist (oder gleiche). Peers warten.
- **Home:** Zurück zum Home Screen, Room verlassen.

### Globale UI-Patterns

**Touch Targets:**
- Minimum **48x48px** für alle interaktiven Elemente (Buttons, Gaps, Links).
- Timeline-Gaps: **56x80px** minimum.
- Buttons: volle Breite im Bottom Bar, 52px Höhe, 16px Font.

**Feedback bei jeder Aktion:**
- Button-Tap: kurzer opacity-Blink (0.7 → 1.0, 100ms). Kein translateY auf Mobile.
- Song platziert: Haptic `impactLight` (expo-haptics).
- Korrekt: Haptic `notificationSuccess`.
- Falsch: Haptic `notificationError`.
- Room joined: Haptic `impactMedium`.

**Loading States:**
Jede async Operation braucht einen Loading State. Keine stille Wartezeit.

| Aktion | Loading UI |
|--------|-----------|
| Room erstellen/joinen | Button disabled + Spinner + "Connecting..." |
| Playlist laden | Button disabled + "Loading playlist..." |
| Song abspielen | "Starting playback..." (kurz, dann Audio-Bars) |
| P2P verbinden | Gelber Dot + "Connecting to peers..." |
| Spotify Auth | Redirect (kein eigener State nötig) |

**Error States:**
Inline, nicht als Alert/Modal. Rote Schrift unter dem relevanten Element.

| Error | Anzeige |
|-------|---------|
| Room not found | Unter Room-Code Input |
| Room full | Unter Room-Code Input |
| Playlist invalid | Unter Playlist-URL Input |
| No Spotify device | Banner oben: "Open Spotify app first" + Retry |
| P2P connection failed | Banner oben: "Connection lost — reconnecting..." |
| Token expired | Automatischer Refresh, bei Fehler: "Spotify session expired" + Re-Login Button |

**Empty States:**
Jeder Container braucht einen leeren Zustand:
- Leere Timeline: "Place your first song here" + einzelner großer Gap
- Keine Spieler (impossible but defensive): "Waiting for players..."
- Kein aktives Gerät: "Open Spotify on your phone to continue"

**Connection Status — immer sichtbar:**

Ein kleiner Dot im Header neben dem Room-Code:
- 🟢 Grün: Connected, P2P aktiv, alle Peers erreichbar
- 🟡 Gelb: Connecting / Reconnecting
- 🔴 Rot: Disconnected

Bei Rot: automatischer Reconnect-Versuch alle 3s, max 10 Versuche.
Nach 10 Versuchen: Banner "Connection lost. Tap to retry." mit manuellem Retry.

**Keyboard Handling:**
- `KeyboardAvoidingView` um jeden Screen mit Inputs.
- `behavior="padding"` auf iOS, `behavior="height"` auf Android.
- Room-Code Input: `returnKeyType="join"`, Submit bei Enter.
- Name Input: `returnKeyType="next"`, Focus wechselt zum nächsten Input.
- Playlist URL: `returnKeyType="go"`, Submit startet Game.

**Safe Areas:**
- `SafeAreaView` als äußerster Container auf jedem Screen.
- Bottom Bar: Extra Padding für Home Indicator (iPhone) via
  `useSafeAreaInsets().bottom`.
- Header: Extra Padding für Notch/Dynamic Island via
  `useSafeAreaInsets().top`.

### Nicht in v1 (bewusst weggelassen)

- Fancy Animationen (Confetti, Flip, Slide) → Phase 6
- Dark/Light Theme Toggle → Phase 6
- Landscape-Support → unnötig für ein Partyspiel
- Tablet-optimiertes Layout → funktioniert dank flexbox, aber kein eigenes Design
- Accessibility (VoiceOver/TalkBack) → Phase 6, nach Feature-Freeze
- Onboarding / Tutorial → Spiel ist selbsterklärend genug
- Splash Screen Customization → Phase 7

---

## Phase 5: Polish & Features

**Ziel:** Fehlende Features aus TODO.md, UX-Verbesserungen, Robustheit.

### 5.1 Hitster-Einwurf ("Buzzer")
- Beliebiger Spieler kann "Hitster!" drücken während Song spielt
- Wenn richtig: bekommt Song in eigene Timeline
- Wenn falsch: Strafkarte (Score -1 oder nächste Runde aussetzen)
- Timing: Nur während `playing` Phase, vor Platzierung des aktiven Spielers

### 5.2 Game Settings (Lobby)
- Win Score konfigurierbar (5/10/15/20)
- Song Preview Dauer (15s/30s/60s/full)
- Max Players (2-8)
- Playlist Size Limit

### 5.3 Reconnect & Host Migration
- Peer Reconnect: automatisch via gleichen Room-Code
- Host Disconnect: nächster Peer wird Host
- State Recovery: neuer Host bekommt letzten State

### 5.4 Sound & Haptics
- Richtig/Falsch Sound Effects
- Haptic Feedback (Tap, Success, Error)
- Notification Sounds (dein Zug, Hitster-Buzz)

### 5.5 Animationen
- Karte fliegt in Timeline (Reanimated)
- Confetti bei richtigem Placement
- Shake bei falsch
- Smooth Phase-Transitions

### 5.6 Weitere Streaming Provider

Neue Provider unter `src/streaming/providers/` hinzufügen:
- Apple Music (MusicKit JS)
- YouTube Music (falls API verfügbar)
- Tidal, Deezer, etc.

Jeder Provider implementiert `StreamingProvider`, wird in `registry.ts`
registriert und taucht automatisch im `ProviderPicker` auf.

### 5.7 Spectator Mode
- Zuschauen ohne mitzuspielen
- Kann alle Timelines sehen
- Kein Spotify-Login nötig

**Lieferbar:** Feature-complete App mit allen geplanten Features.

---

## Phase 6: Build & Distribution

**Ziel:** App in die Stores bringen.

### 6.1 App Store Vorbereitung
- App Icon (1024x1024)
- Splash Screen
- App Store Screenshots (6.7", 6.5", 5.5")
- App Store Beschreibung + Keywords
- Privacy Policy (kein Backend = wenig Daten)

### 6.2 iOS
- Apple Developer Account ($99/Jahr)
- EAS Build: `eas build --platform ios`
- TestFlight für Beta
- App Store Review

### 6.3 Android
- Google Play Console ($25 einmalig)
- EAS Build: `eas build --platform android`
- Internal Testing Track für Beta
- Play Store Review

### 6.4 Web
- Expo Web Export: `npx expo export --platform web`
- Hosting auf Vercel/Netlify (kostenlos)
- Custom Domain (hitster.app o.ä.)

### 6.5 CI/CD
- GitHub Actions für automatische Builds
- EAS Update für Over-the-Air Updates (kein Store-Review nötig)
- Sentry für Crash Reporting

**Lieferbar:** App live in App Store, Play Store und Web.

---

## Abhängigkeiten zwischen Phasen

```
Phase 1 (Core + Types)
  └─► Phase 2 (Streaming Abstraction + Spotify) ──┐
  └─► Phase 3 (P2P) ──────────────────────────────┤
                                                    ▼
                                              Phase 4 (UI)
                                                    │
                                              Phase 5 (Polish + weitere Provider)
                                                    │
                                              Phase 6 (Distribution)
```

Phase 2 (Streaming) und Phase 3 (P2P) können parallel entwickelt werden — sie sind unabhängig.

## Was wegfällt (gegenüber aktueller Version)

- `server/` — komplett (Express, Socket.IO, Routes)
- `client/` — wird ersetzt durch Expo App
- `package.json` (root) — concurrently + server/client Workspace
- ngrok Setup für Entwicklung
- Server-seitige Spotify Auth
- Web Playback SDK

## Was wiederverwendet wird

- **Game Logic:** checkPlacement, advanceTurn, checkWin (neu typisiert)
- **Spotify API Calls:** Playlist fetching, Play/Pause (leicht angepasst)
- **UI Konzepte:** Timeline, PlayerList, Reveal (neu in RN)
- **Design:** Farbschema, Layout-Ideen aus App.css
