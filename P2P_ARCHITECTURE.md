# Hitster P2P – Architektur ohne Server

## Ziel

Hitster als PWA oder mobile App, komplett ohne eigene Server-Infrastruktur.
Selber Funktionsumfang wie die aktuelle Version: Raum erstellen, Spotify verbinden,
Songs raten, Timelines, Multiplayer-Sync.

**Voraussetzung:** Alle Spieler haben Spotify Premium und die Spotify-App installiert.

## TL;DR

**Machbar – mit Einschränkungen.** Die Architektur sähe so aus:

- **P2P-Verbindung:** Trystero (WebRTC) mit Firebase Signaling (kostenloser Spark-Plan)
- **Spotify Auth:** PKCE Flow, komplett client-seitig, kein Backend nötig
- **Musik-Playback:** Spotify Web API als Fernbedienung für die installierte Spotify-App (kein Web Playback SDK nötig)
- **Game State:** Host-basiert – wer den Raum erstellt, ist der Authority-Peer
- **Plattform:** PWA (React), teilbar als URL, kein App Store nötig

**Was man trotzdem braucht:**
- Ein Firebase-Projekt (Spark/Free) für WebRTC-Signaling
- Öffentliche STUN-Server (kostenlos, z.B. Google)
- Optional: TURN-Server für mobile Carrier-NATs (~30% der Mobilfunk-Verbindungen brauchen das)

**Was komplett wegfällt:**
- Node.js / Express / Socket.IO
- Eigener Server / VPS / Hosting
- Serverseitige Spotify-Auth

---

## 1. Peer-to-Peer mit WebRTC

### Warum WebRTC?

WebRTC Data Channels sind end-to-end-verschlüsselt, laufen über UDP (niedrige Latenz)
und werden von allen modernen Browsern unterstützt (Desktop + Mobile).

### Bibliothek: Trystero

[Trystero](https://github.com/dmotz/trystero) ist die beste Option für diesen Use Case.
Peers finden sich über öffentliche Infrastruktur – kein eigener Server nötig.

**Signaling-Strategien:**

| Strategie | Eigener Server? | Zuverlässigkeit | Kosten |
|-----------|----------------|-----------------|--------|
| Firebase | Ja (eigenes Projekt) | Hoch (99.95% SLA) | Kostenlos (Spark) |
| Supabase | Ja (eigenes Projekt) | Hoch | Kostenlos (Free Tier) |
| BitTorrent | Nein | Mittel | Kostenlos |
| Nostr | Nein | Mittel | Kostenlos |
| MQTT | Nein | Mittel | Kostenlos |

**Empfehlung:** Firebase-Strategie für Produktion. BitTorrent/Nostr für Prototypen.

**Beispiel-API:**

```javascript
import { joinRoom } from 'trystero'

const room = joinRoom({ appId: 'hitster' }, 'ROOM-CODE')
const [sendState, onState] = room.makeAction('gameState')

// State empfangen
onState(state => updateGame(state))

// State senden (als Host)
sendState({ turn: 2, scores: [5, 3], currentSong: 'spotify:track:...' })
```

### NAT-Traversal Problem

- STUN allein: ~70-75% Erfolgsrate
- Mit TURN-Fallback: ~90%+
- Mobile Carrier-NATs sind das Hauptproblem
- Kostenlose STUN-Server: `stun:stun.l.google.com:19302`
- TURN: Metered.ca hat ein Free Tier, ansonsten Twilio/Xirsys (kostenpflichtig)

**Risiko:** Ohne TURN-Server werden ~15-30% der Mobilfunk-Nutzer keine direkte
P2P-Verbindung aufbauen können.

---

## 2. Spotify ohne Backend

### Auth: PKCE Flow (Client-Side Only)

Seit November 2025 ist PKCE der einzige unterstützte Flow für Client-Apps.
Kein Client Secret nötig, alles läuft im Browser.

```
Browser → Spotify Auth (PKCE) → Access Token im Browser
```

- Implicit Grant wurde von Spotify entfernt
- `http://localhost` als Redirect URI wurde entfernt, `http://127.0.0.1` geht noch
- Für Produktion: HTTPS Redirect URI nötig (z.B. via GitHub Pages, Netlify, Vercel)

### Playback: Spotify-App als Player (Remote Control)

Da alle Spieler Spotify installiert haben, brauchen wir kein Web Playback SDK.
Stattdessen steuern wir die Spotify-App direkt über die Web API:

```javascript
// Song auf der Spotify-App des Users abspielen
await fetch('https://api.spotify.com/v1/me/player/play', {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ uris: ['spotify:track:...'] })
})

// Pausieren
await fetch('https://api.spotify.com/v1/me/player/pause', {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` }
})
```

**Vorteile gegenüber Web Playback SDK:**
- Funktioniert auf ALLEN Plattformen (iOS, Android, Desktop) – keine EME/DRM-Probleme
- Kein Browser-Autoplay-Policy-Problem
- Bessere Audioqualität (Spotify-App statt Browser-Decoder)
- Background-Audio funktioniert automatisch (Spotify-App läuft weiter)
- Kein SDK-Script laden nötig

**Ablauf:**
1. User öffnet Spotify-App kurz (damit ein aktives Gerät registriert ist)
2. PWA authentifiziert via PKCE
3. PWA sendet Play/Pause-Befehle an die Spotify-API
4. Spotify-App auf dem Gerät spielt den Song ab

**Sync zwischen Spielern:**
Host sendet `play`-Befehl via P2P an alle Peers → jeder Peer ruft die
Spotify Web API auf seinem eigenen Token auf → alle Spotify-Apps starten
gleichzeitig (±1-2 Sekunden Versatz, gut genug für ein Ratespiel).

---

## 3. Room-Discovery ohne Server

### Option A: Room-Code + Trystero (Empfohlen)

Wie bei Jackbox: Host erstellt einen Raum, bekommt einen Code.
Der Code wird als Trystero-Raumname verwendet.

```
Host öffnet App → Code "XKCD42" wird generiert
Host teilt Code per Discord/WhatsApp/mündlich
Mitspieler öffnet App → gibt "XKCD42" ein → Trystero verbindet P2P
```

Kein Server nötig – der Code ist nur ein Trystero-Namespace.

### Option B: QR-Code

Host generiert QR-Code mit Verbindungsinfos. Andere scannen.
Gut für "alle im selben Raum"-Szenario. Braucht keine Internetverbindung
für den Discovery-Teil (WebRTC-Verbindung braucht aber Internet).

### Option C: Share-Link

URL mit Room-Info: `https://hitster.app/join/XKCD42`
App öffnet sich, liest Code aus URL, verbindet automatisch.

### Was NICHT geht (im Browser)

- Bluetooth: Nur auf Android Chrome, nicht auf iOS
- NFC: ~6% Browser-Support, nicht auf iOS
- mDNS/Bonjour: Nur in nativen Apps (React Native)

---

## 4. Game State Sync

### Host-basiertes Modell (Empfohlen)

Für ein rundenbasiertes Partyspiel mit 2-8 Spielern ist Host-Authority
die einfachste und robusteste Lösung:

```
Host (Spieler 1)
  ├── Hält den kompletten Game State
  ├── Validiert alle Aktionen (Song platziert, Hitster-Einwurf)
  ├── Broadcastet State-Updates an alle Peers
  └── Wenn Host disconnected → Spiel ist vorbei

Peers (Spieler 2-8)
  ├── Senden Aktionen an Host ("place-song", "hitster-buzz")
  ├── Empfangen State-Updates vom Host
  └── Rendern UI basierend auf empfangenem State
```

**Vorteile:**
- Einfach zu implementieren (fast identisch zur aktuellen Socket.IO-Logik)
- Keine Consensus-Algorithmen nötig
- Host validiert → minimaler Cheat-Schutz

**Nachteile:**
- Host-Disconnect = Game Over (akzeptabel für Partyspiel)
- Host hat minimalen Latenz-Vorteil (irrelevant bei rundenbasiertem Spiel)

### Alternative: CRDTs mit Yjs

[Yjs](https://yjs.dev/) + [y-webrtc-trystero](https://github.com/WinstonFassett/y-webrtc-trystero)
würde automatische State-Synchronisation ohne Host ermöglichen.
Für ein rundenbasiertes Spiel overkill, aber robuster bei Netzwerk-Partitionen.

---

## 5. Plattform-Entscheidung

### PWA (Empfohlen für v1)

| Pro | Contra |
|-----|--------|
| Kein App Store nötig | Kein Bluetooth/NFC für lokale Discovery |
| Teilbar als URL | iOS-PWA hat kleinere Einschränkungen |
| Sofortige Updates | |
| Ein Codebase für alle | |

**Playback:** Ausschließlich über die Spotify Web API (Remote Control).
Da Spotify installiert ist, gibt es keine Plattform-Probleme – die
Spotify-App übernimmt das Audio, der Browser nur die Steuerung.
Kein Web Playback SDK, kein EME/DRM, kein Autoplay-Problem.

### React Native / Expo (Wenn native Features nötig)

- [@wwdrew/expo-spotify-sdk](https://www.npmjs.com/package/@wwdrew/expo-spotify-sdk) – Expo-kompatibel, aktuell (April 2025)
- [react-native-spotify-remote](https://github.com/cjam/react-native-spotify-remote) – RN-Wrapper für Spotify Remote SDK
- Zugang zu Bluetooth, NFC, lokaler Netzwerk-Discovery
- Erfordert App Store Distribution

---

## 6. Architektur-Übersicht

```
┌──────────────────────────────────────────────────┐
│                    PWA (React)                    │
├──────────┬───────────────┬───────────────────────┤
│ Spotify  │   Trystero    │      Game Logic       │
│ PKCE Auth│   (WebRTC)    │   (Host Authority)    │
│          │               │                       │
│ Web API  │ Firebase      │ State Management      │
│ Remote   │ Signaling     │ Turn Validation       │
│ Control  │ (Free Tier)   │ Timeline Logic        │
├──────────┴───────────────┴───────────────────────┤
│               Browser / PWA Shell                 │
└──────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
   Spotify API                  Andere Peers
   (PKCE, no server)           (WebRTC P2P)
```

---

## 7. Migration: Aktuell → P2P

### Was sich ändert

| Aktuell (Client-Server) | P2P |
|--------------------------|-----|
| Socket.IO | Trystero WebRTC Data Channels |
| Express Auth Routes | Spotify PKCE im Browser |
| Server-side GameManager | GameManager läuft beim Host-Peer |
| Web Playback SDK | Web API Remote Control (Spotify-App) |
| ngrok für Entwicklung | Lokaler Dev-Server reicht |

### Was gleich bleibt

- React Frontend
- Game-Logik (checkPlacement, advanceTurn, etc.)
- UI-Komponenten (Timeline, PlayerList, etc.)
- Spotify API Calls (nur Auth-Flow ändert sich)

### Migrations-Schritte

1. Spotify Auth auf PKCE umbauen (Client-only)
2. Socket.IO durch Trystero ersetzen (ähnliche Event-API)
3. GameManager in den Host-Client verschieben
4. Web Playback SDK komplett durch Web API Remote Control ersetzen
5. Static Hosting (GitHub Pages, Netlify, Vercel) statt Server

---

## 8. Offene Risiken

| Risiko | Impact | Mitigation |
|--------|--------|------------|
| Kein TURN-Server | ~30% Mobile können nicht P2P connecten | Metered.ca Free Tier oder akzeptieren |
| Host-Disconnect | Spiel bricht ab | Host-Migration implementieren (komplex) |
| Spotify-App nicht aktiv | Remote Control schlägt fehl | Onboarding: "Öffne kurz Spotify bevor du spielst" |
| Spotify API Rate Limits | Bei vielen gleichzeitigen Calls | Calls bündeln, nicht bei jedem State-Update senden |

---

## Fazit

P2P Hitster ist machbar und der Aufwand überschaubar – die Game-Logik bleibt fast
identisch. Der größte Gewinn: kein Server, keine laufenden Kosten, kein ngrok-Setup.

Da Spotify bei allen Spielern installiert ist, fällt das größte Risiko weg:
kein Web Playback SDK nötig, kein EME/DRM-Stress, kein Autoplay-Problem.
Die Spotify-App übernimmt das Audio, die PWA ist nur Steuerung + Spiellogik.

Empfohlener Stack: **React PWA + Trystero (Firebase) + Spotify PKCE + Web API Remote Control**.
