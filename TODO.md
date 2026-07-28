# bitster – TODO

Stand: 20.07.2026 (nach Relay-Migration, Auth-Härtung, Playback-Robustheit und Refactoring — Details in REVIEW.md).

## Vor dem nächsten Game Night

- [ ] **Deploy auf Railway** — aktueller Stand bauen & deployen; danach alle Mitspieler die Seite neu laden lassen (alte Tabs sprechen das Relay-Protokoll nicht).
- [ ] **Spotify-Accounts allowlisten** — jeder neue Mitspieler muss im Spotify Developer Dashboard unter "User Management" eingetragen werden (Dev Mode, max. 25). Die 2 aktuellen Test-Freunde sind drin.
- [ ] **Real-World-Test Playback-Recovery** — der `NO_ACTIVE_DEVICE`-Transfer-Retry (player.ts) ist nur mit echten Premium-Accounts testbar.

## Offen (Features / Robustheit)

- [ ] **Spieler kicken** — Host-UI fehlt; das `kick-player`-Protokoll wurde beim Aufräumen entfernt und müsste zusammen mit der UI neu dazu.
- [ ] **ProviderPicker** — `registry.listProviders()` existiert, aber die UI hardcodet Spotify (`app/index.tsx`). Relevant erst mit einem zweiten Streaming-Provider.
- [ ] **Song-Preview/Timer** — nur 30–60s abspielen statt des ganzen Songs, mit Countdown.
- [ ] **Error Boundary** um die App (Crash → freundlicher Screen statt weißer Seite).
- [ ] **Rejoin nach App-Neustart** — Reconnect überlebt Socket-Drops und Screen-Lock (AppState-Listener), aber kein komplettes Neustarten der App (Session-Persistenz für Raumcode + Peer-ID).
- [ ] **No-Buzz-Auto-Reveal** — der Buzz-Lock-in hat einen Timer (host.ts `buzzTimer`), aber das bitster-Window OHNE Buzz läuft unbegrenzt, bis alle passen oder der aktive Spieler revealt; optionaler Auto-Reveal nach X Sekunden.
- [ ] **🫠 Melt Mode v2/v3** — v1 (Live-Melt via SVG-Displacement auf dem App-Root, `ThemeEffects.melt`, Intensitäts-Slider, Tadi + Custom-Editor) ist drin — Web ohne Safari, respektiert prefers-reduced-motion. Offen: v2 WebGL-Frozen-Frame-Melt als Übergang (Reveal/„TOO SLOW!"/GAME OVER — läuft dann auch auf iOS-Web, Doom-Style-Drip), v3 nativ (Android 13+ RenderEffect-RuntimeShader live, iOS via react-native-skia Snapshot + SkSL).

## Nice to Have

- [ ] Sound-Effekte beim Reveal, Animationen (Karte fliegt in Timeline, Confetti)
- [ ] Spectator Mode / Mid-Game-Join als Zuschauer
- [ ] Statistiken (Trefferquote, Runden-History)
- [ ] Mehrere Playlists kombinieren
- [ ] Chat / Emoji-Reactions
- [ ] Native Builds (iOS/Android) — WebSocket läuft nativ out of the box; braucht `EXPO_PUBLIC_RELAY_URL` aufs Deployment + `bitster://auth/callback` im Spotify Dashboard

## Erledigt (Auswahl, siehe REVIEW.md für alles)

- [x] WebSocket-Relay statt WebRTC/Trystero (Joins funktionieren in jedem Netz)
- [x] Echter Join-Handshake, Host-Loss-Detection, Auto-Reconnect, Resume-Rejoin
- [x] Spotify: PKCE-Verifier persistiert + Cold-Start-Recovery, Single-Flight-Refresh, 429-Backoff
- [x] Antwort-Leak gefixt (playedSongs + Jahr-Maskierung bis Reveal)
- [x] Playback-Fehler sichtbar (NowPlaying), NO_ACTIVE_DEVICE-Recovery, Geräteauswahl bleibt erhalten
- [x] `game-state` strukturell validiert; `connection.ts` in host/peer/transport gesplittet; `game.tsx` in Phase-Views zerlegt
- [x] Legacy `client/` + `server/` gelöscht; 87 Unit Tests grün
