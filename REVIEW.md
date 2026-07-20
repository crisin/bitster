# Code Review & Verbesserungsplan (Juli 2026)

Review des Stands auf Branch `p2p-mobile-app` (app/ + src/, ~6.600 Zeilen).
Fokus: die gemeldeten Probleme (Spotify-Connect schlägt fehl, Lobby-Join schlägt fehl) plus allgemeine Code-Qualität.

> **Update (20.07.2026): Architektur-Entscheidung + erste Umsetzung.**
> WebRTC/Trystero wurde komplett durch einen **WebSocket-Relay auf dem bestehenden
> Railway-Server** ersetzt (`server.js` + `ws`, Host-Peer bleibt Game Authority).
> Damit sind die Transport-Findings aus dem Lobby-Abschnitt (kein TURN, öffentliche
> Nostr-Relays, kaputter Handshake, kein Reconnect, native WebRTC-Blockade) obsolet
> bzw. behoben. Ebenfalls umgesetzt: Antwort-Leak-Fix, Join-Rejections/Fehler sichtbar,
> Mid-Game-Join-Ablehnung, Doppel-Tap-Guard, `login()` awaited. Verifiziert per
> Typecheck, 61 Unit Tests und Zwei-Tab-Spieldurchlauf gegen den lokalen Relay.
> Der Plan unten ist entsprechend aktualisiert.

## Gesamteinschätzung

Das Fundament ist gut: striktes TypeScript ohne Escapes, pure und gut getestete Game Logic (56 Tests, alle grün), saubere Store-Trennung, echte Provider-Abstraktion, Validierung an der P2P-Grenze. `tsc --noEmit` läuft fehlerfrei durch.

Die gemeldeten Verbindungsprobleme sind **keine Mysterien** — beide haben mehrere konkrete, identifizierte Ursachen im Code bzw. im Setup. Dazu kommt ein spielentscheidender Bug (Antwort-Leak, siehe unten) und zwei God-Files, die Wartung und Testbarkeit bremsen.

---

## Warum Spotify-Connect bei Freunden fehlschlägt

1. **Spotify Development Mode (wahrscheinlichste Ursache, kein Code-Bug):** Die App läuft mit fest verdrahteter Client ID (`src/streaming/providers/spotify/auth.ts:8`). Spotify-Apps im Dev Mode erlauben max. 25 Nutzer, und **jeder Spotify-Account muss im Developer Dashboard unter "User Management" manuell eingetragen werden**. Nicht eingetragene Freunde loggen sich erfolgreich ein und bekommen dann 403 — was die App nur als generisches "Auth failed" zeigt.
2. **Code Verifier nur im RAM (`auth.ts:120-147`):** Wird der App-Prozess während des Browser-Logins von Android/iOS gekillt (häufig!), ist der PKCE-Verifier weg und es gibt keinen Cold-Start-Pfad, der den `code` aus der Launch-URL verarbeitet. Ergebnis: endloser "Connecting..."-Spinner nach erfolgreichem Login.
3. **Token-Refresh-Race (`auth.ts:241-286`):** Kein Mutex — zwei parallele Calls refreshen beide mit demselben Refresh Token. Spotify rotiert Refresh Tokens, der zweite Refresh bekommt `invalid_grant`, und der Catch-Block (`auth.ts:196-201`) **löscht daraufhin alle Tokens** → scheinbar zufällige Logouts.
4. **Tokens werden bei JEDEM Refresh-Fehler gelöscht (`auth.ts:196-201`):** Auch bei transienten Netzwerkfehlern (schlechtes WLAN, Carrier-NAT) fliegt der gültige Refresh Token weg → erneuter Voll-Login nötig.
5. **Fehler unsichtbar:** `provider.auth.login()` wird ohne await/catch aufgerufen (`app/index.tsx:91`, `DeviceSelector.tsx:57`), `result.error` wird verworfen (`auth.ts:153`). Der Button springt kommentarlos zurück auf "Connect Spotify".
6. **Zwei divergierende Callback-Routen:** Nativ `hitster://callback` → `app/callback.tsx`, Web `/auth/callback` → `app/auth/callback.tsx`. Beide URIs müssen exakt im Spotify Dashboard registriert sein; fehlt eine, scheitert genau eine Plattform. In Expo Go funktioniert Auth grundsätzlich nie (dynamische `exp://`-URI).

## Warum Lobby-Joins fehlschlagen

1. **Kein TURN-Server (`src/p2p/connection.ts:108`):** `joinRoom` bekommt keine `rtcConfig`/ICE-Server. ~30 % der Mobilfunk-NATs brauchen TURN (steht sogar in CLAUDE.md) — Signaling klappt, ICE verbindet nie, Peer hängt bei "Connecting..." und bekommt irreführend "No host found".
2. **Falsches Signaling-Backend:** Code nutzt `trystero/nostr` mit **öffentlichen Default-Relays** statt des geplanten Firebase-Signalings (alle Docs sagen Firebase). Öffentliche Relays sind rate-limited/instabil; Host und Peer können auf disjunkten Relay-Subsets landen und sich nie finden. Zudem teilen sich alle Installationen den globalen Namespace `hitster-p2p-v1` (Kollisionen möglich, kein `password`).
3. **Kaputter Join-Handshake (`connection.ts:146-157`):** Der Peer wertet die **erste beliebige Peer-Verbindung** als "beim Host gejoint", setzt Status `connected` und cancelt den Timeout — auch wenn es nur ein anderer Gast ist. Zwei Gäste ohne erreichbaren Host zeigen beide "connected" mit leerer Lobby, für immer, ohne Fehler.
4. **Join-Ablehnungen unsichtbar (`connection.ts:476-482`, `app/game.tsx:187`):** "Room is full" etc. landet in `lastError`, aber das Banner rendert nur bei Status `error` — der bleibt `connected`. Voller Raum = stiller Hänger.
5. **Host merkt Signaling-Fehler nicht (`connection.ts:44-47`):** `createRoom` setzt synchron `connected`, bevor irgendeine Verbindung existiert. Host zeigt fröhlich den Raumcode, niemand kann joinen.
6. **Kein Reconnect:** Kein AppState-Listener, kein Heartbeat, kein Auto-Rejoin (die Konstanten `MAX_RECONNECT_ATTEMPTS`/`RECONNECT_INTERVAL_MS` sind toter Code). Screen-Lock oder WLAN→LTE-Wechsel wirft den Spieler raus; Host-Refresh killt den Raum, Peers zeigen weiter "connected". Host-Migration in `logic.ts:71-94` ist toter Code (läuft nur auf dem Gerät, das gerade gegangen ist).
7. **Trystero auf nativem React Native ungeklärt:** Kein `react-native-webrtc`, keine Polyfills im Repo — native iOS/Android-Builds haben kein `RTCPeerConnection`. Web (via `server.js`/Dockerfile-Deploy) funktioniert; native Builds vermutlich gar nicht.
8. **Kleinigkeiten:** Raumcode-Charset-Mismatch (Generierung schließt I/O/0/1 aus, Validierung/Eingabe nicht konsistent — `0` statt `O` getippt wird still verschluckt), Doppel-Tap auf Create/Join erzeugt zwei Räume, Mid-Game-Joins sind erlaubt.

## Kritischer Gameplay-Bug: Antwort-Leak

`pickRandomSong`/`setSongFromIndex` (`src/game/logic.ts:96-151`) hängen den aktuellen Song **sofort beim Picken** an `playedSongs`, und `buildGameState` (`logic.ts:468`) broadcastet Name, Artist und Jahr an alle Peers — schon während der `playing`-Phase. Jeder Spieler kann während des Ratens die "Played (n)"-Liste aufklappen (`app/game.tsx:392`) und die Antwort ablesen. Fix: aktuellen Song erst beim Reveal in den Broadcast aufnehmen.

## Code-Qualität allgemein

- **God-Files:** `src/p2p/connection.ts` (690 Zeilen — Transport + Host-Logik + Peer-Logik + Playback-Orchestrierung + 10 mutable Modul-Variablen als Host-State) und `app/game.tsx` (807 Zeilen — alle 5 Phasen inline, 3× kopierter Timeline-Block). Das geplante `host.ts`/`peer.ts`-Split existiert nicht.
- **Typ-Loch im wichtigsten Message-Typ:** `game-state` wird per Doppel-Cast (`p as unknown as GameState`, `protocol.ts:62`) fast ungeprüft in den Store übernommen.
- **Test-Lücken:** Game Logic gut getestet; `validateAction`, der komplette Host-Action-Flow, Auth-Token-Logik, `roomCode.ts` und die Stores haben null Tests. Das Modul-State-Design von connection.ts macht Host-Logik untestbar — noch ein Argument für den Split.
- **Playback-Fehler unsichtbar:** Play/Pause-Fehler werden nur geloggt (`connection.ts:553/563/667`); `NowPlaying` hat einen `error`-Prop, der nie befüllt wird. Kein aktives Spotify-Gerät (404 `NO_ACTIVE_DEVICE`) wird nicht behandelt — sehr häufig, wenn die Spotify-App ein paar Minuten idle war. `getDevices()` überschreibt zudem die manuelle Geräteauswahl (`player.ts:64-67`). Kein 429/Rate-Limit-Handling.
- **Toter Code:** `client/` + `server/` (22 Dateien Legacy, nichts importiert sie — `server.js`/`Dockerfile` dagegen sind der aktive Web-Deploy und bleiben), 8 von 9 ungenutzte Setter in `game/store.ts`, dead Protocol-Actions (`kick-player` halb gebaut), `getPlaylistTracks` ungenutzt.
- **Docs-Drift:** TODO.md beschreibt komplett die alte Express/Socket.IO-App; P2P_ARCHITECTURE.md/IMPLEMENTATION_PLAN.md/CLAUDE.md sagen Firebase-Signaling, Code macht Nostr; Komponentenlisten stimmen nicht mehr.
- **Kleineres:** Guess-Antworten werden auf Info-Level geloggt (landen im teilbaren Log-Export), ein `as any` in `app/index.tsx:185`, `Track`/`Song` sind Duplikat-Typen.

---

## Verbesserungsplan (priorisiert, Stand 20.07.2026)

### Phase 1 — Sofortmaßnahmen ✅ größtenteils erledigt

1. ✅ **Transport ersetzt:** WebSocket-Relay in `server.js` (Räume, Peer-IDs, echte
   Fehler-Antworten, 30s Host-Grace-Period), Client-Transport in `p2p/connection.ts`
   komplett auf WebSocket umgestellt. TURN/Signaling-Themen damit obsolet.
   `trystero` entfernt, `ws` hinzugefügt, Dockerfile angepasst.
2. ✅ **Echter Join-Handshake:** Peer ist erst `connected`, wenn der erste `game-state`
   vom Host da ist; `game-state` wird nur vom Host-Peer akzeptiert; Host-Loss →
   Grace → "The host closed the room."; Auto-Reconnect mit Backoff bei Socket-Drop.
3. ✅ **Antwort-Leak gefixt:** `buildGameState` filtert den aktuellen Song aus
   `playedSongs` und maskiert sein Jahr in den Timelines bis zum Reveal (+ Tests).
4. ✅ **Fehler sichtbar:** Join-Rejections (voll, läuft schon) als Fehlerbanner;
   In-Game-Fehler ("Not your turn") als Toast; `login()` awaited mit Fehlermeldung;
   Doppel-Tap-Guard; Mid-Game-Joins werden abgelehnt (Reconnects bleiben erlaubt).
5. ⬜ **Spotify Dashboard (manuell, kein Code):** Mitspieler-Accounts unter
   "User Management" allowlisten; beide Redirect-URIs exakt registriert halten
   (`hitster://callback` nativ, `https://<domain>/auth/callback` web).

### Phase 2 — Auth-Härtung ✅ erledigt (20.07.2026)

6. ✅ Code Verifier + State werden **vor** dem Browser-Hop persistiert
   (SecureStore nativ, localStorage web); `completePendingAuth()` im
   Callback-Screen vollendet den Exchange nach App-Kill/Full-Redirect,
   inkl. State-Validierung und 10-min-Ablauf der Pending-Session.
7. ✅ Single-Flight-Refresh (eine geteilte Refresh-Promise); Tokens werden nur
   noch bei `invalid_grant` gelöscht, Netzwerkfehler behalten sie; 60 s
   Expiry-Buffer in `getAccessToken`/`restoreSession`.
8. ✅ Eine Callback-Route für beide Plattformen (`app/auth/callback.tsx`,
   nativ jetzt `hitster://auth/callback` — Dashboard-Eintrag nötig, sobald
   native Builds verteilt werden); Callback-Screen mit Timeout, Fehlerzustand
   und Home-Button; Popup-Erkennung verhindert doppelten Code-Exchange;
   Expo Go wird erkannt und mit klarer Meldung abgelehnt.
   Verifiziert im Browser: Cold-Start-Recovery (echter Spotify-Roundtrip),
   State-Mismatch-Ablehnung, abgelaufene Pending-Session.

### Phase 3 — Verbindungsfeinschliff ✅ erledigt (20.07.2026)

9. ✅ AppState-Listener: kommt die App mit totem Socket in den Vordergrund,
   wird sofort per `rejoin` wiederverbunden statt auf Timeouts zu warten.
10. ✅ Raumcode: Validierung an das Generator-Charset angeglichen (kein I/O
    mehr gültig). Da 0/1/I/O alle ausgeschlossen sind, gibt es kein sinnvolles
    Mapping — stattdessen erklärt ein Hinweis "Room codes never contain
    0, 1, I or O", warum das getippte Zeichen verschwindet.
11. ✅ Host prunt Platzhalter-Peers, die 10 s lang kein `join` schicken (mit Test).

### Phase 4 — Playback-Robustheit ✅ erledigt (20.07.2026)

12. ✅ `play()` behandelt `NO_ACTIVE_DEVICE` (404): Geräte neu holen → auf das
    beste Gerät transferieren (manuelle Auswahl > `is_active` > erstes) → ein
    Retry; ohne Geräte klare Meldung "Open the Spotify app, play any song
    briefly...". Playback-Fehler landen im Streaming-Store (`playbackError`)
    und werden in `NowPlaying` statt der Equalizer-Animation angezeigt —
    Host- und Peer-Pfad, verifiziert im Zwei-Tab-Test.
13. ✅ `getDevices()` behält die manuelle Geräteauswahl, solange das Gerät noch
    existiert; `fetchWithAuth` wartet bei 429 das `Retry-After` ab (max 15 s)
    und retried einmal.

### Phase 5 — Refactoring & Hygiene ✅ erledigt (20.07.2026)

14. ✅ `connection.ts` gesplittet: `host.ts` (`HostSession`-Klasse mit injizierter
    Send-Funktion — Host-State in der Klasse statt Modul-Variablen, dadurch
    testbar), `peer.ts` (Host-Message-Handling via Callbacks, keine Import-Zyklen),
    `connection.ts` nur noch Transport (~370 statt ~800 Zeilen).
    Neue Tests: `host.test.ts` (Lobby-/Spielfluss, Join-Rejection, Pruning,
    Antwort-Leak auf Integrationsebene) + `protocol.test.ts` — 87 Tests gesamt.
15. ✅ `app/game.tsx` (807 → ~380 Zeilen) in Phase-Views zerlegt
    (`components/game/phases/…`), 3× kopierter Timeline-Block →
    `AllPlayerTimelines`. Nebenbei gefixt: doppelte "Your Timeline"-Sektion für
    Nicht-aktive Spieler; `guessSubmitted` resettet jetzt pro Song (vorher
    blieb es nach einem Skip hängen).
16. ✅ `game-state` und `update-settings` werden strukturell validiert
    (`validateGameState` — Spieler, Timelines, Songs, Settings, Ergebnisse);
    unbekannte Felder werden gestrippt.
17. ✅ `client/` + `server/` gelöscht (22 Legacy-Dateien), tote Store-Setter
    entfernt (`applyGameState` nutzt jetzt den geteilten `GameState`-Typ),
    tote Protocol-Actions entfernt (`player-joined`, `player-left`,
    `pause-song`, `kick-player`), ungenutztes `getPlaylistTracks` entfernt.
18. ✅ Docs: TODO.md neu geschrieben, P2P_ARCHITECTURE.md auf die
    Relay-Architektur umgeschrieben, IMPLEMENTATION_PLAN.md als historisch
    markiert (CLAUDE.md war bereits aktuell).

### Native Builds (separat zu entscheiden)

WebSocket funktioniert in React Native out of the box — die frühere WebRTC-Blockade
ist weg. Für native Builds fehlt nur noch: `EXPO_PUBLIC_RELAY_URL` aufs Deployment
zeigen lassen + Auth-Härtung aus Phase 2 (Deep-Link-Callback).
