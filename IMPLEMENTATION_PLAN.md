# Implementierungsplan (historisch)

> **Dieses Dokument ist abgeschlossen und nur noch historisch.**
>
> Es beschrieb die 6-Phasen-Migration von Express/Socket.IO zur Expo-App mit
> Trystero/WebRTC. Die Migration ist passiert — allerdings wurde der
> WebRTC-Transport im Juli 2026 durch einen WebSocket-Relay auf dem
> Railway-Server ersetzt (Begründung und Details: **P2P_ARCHITECTURE.md**).
>
> Aktuelle Referenzen:
> - **CLAUDE.md** — gültige Architektur, Konventionen, Projektstruktur
> - **P2P_ARCHITECTURE.md** — Multiplayer-Architektur (Relay-Protokoll, Handshake)
> - **REVIEW.md** — Code-Review Juli 2026 + umgesetzter Verbesserungsplan
> - **TODO.md** — was noch offen ist

## Was vom Plan übrig blieb

- Expo + Expo Router + Zustand + strikte TS-Struktur: umgesetzt wie geplant.
- Pure Game Logic in `src/game/logic.ts` mit Tests: umgesetzt.
- Streaming-Provider-Abstraktion (`src/streaming/`): umgesetzt (Spotify PKCE).
- `host.ts`/`peer.ts`-Split: umgesetzt (als `HostSession`-Klasse + Peer-Handler).
- Trystero/WebRTC/Firebase/TURN: **verworfen** zugunsten des Relays.
- NativeWind: nicht eingeführt — StyleSheet.create wird durchgängig genutzt.
