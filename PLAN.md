# bitster – Plan: Resilienz, Schema, Statistik

Stand: 28.07.2026. Ergebnis der Architektur-Durchsicht nach der Relay-Migration
(Historie siehe REVIEW.md, offene Kleinigkeiten in TODO.md).

Vier Pakete, in dieser Reihenfolge. P0 zuerst, weil ein Spiel, das mitten drin
abbricht, auch keine Statistik produziert. P4 liegt bewusst auf Eis.

> **Stand 28.07.2026: P0–P3 sind umgesetzt.** 279 Tests grün, Typecheck sauber.
> Details zur Umsetzung stehen in P2P_ARCHITECTURE.md (Reconnect &
> Session-Persistenz, Uhren & Reihenfolge, Runden-Log & Recap) und in CLAUDE.md.
> Die Beschreibungen unten bleiben als Begründung stehen, warum es so gebaut ist.
>
> Beim Bauen zusätzlich gefunden und mit erledigt: der Relay akzeptierte jedes
> `rejoin` für eine beliebige Peer-ID. Da Peer-IDs im Raum öffentlich sind,
> konnte jeder mit dem Raumcode die Host-Rolle übernehmen und den echten Host
> vom Socket trennen. `rejoin` verlangt jetzt ein beim Beitritt vergebenes
> Token. **Achtung: das ändert das Relay-Protokoll** — nach dem Deploy müssen
> alle Clients neu laden, alte Tabs können sich nicht mehr wiederverbinden.

---

## P0 – Verbindungs-Resilienz ✅

**Problem 1: Ein Reconnect wirft den Spieler aus dem laufenden Spiel.**

Der Auto-Reconnect ist gebaut, aber der Host macht ihn zunichte:

1. Der Server meldet beim Socket-Abriss sofort `peer-left` (`server.js`)
2. Der Host ruft `logic.removePlayer` (`p2p/host.ts` `handlePeerLeft`) — Spieler
   samt Timeline weg
3. Der Peer verbindet sich per `rejoin` mit **derselben** ID wieder und schickt
   die `join`-Action
4. `logic.addPlayer` findet ihn nicht mehr unter `players`, die Phase ist nicht
   `lobby` → `throw "Game is already in progress"`
5. `p2p/peer.ts` macht daraus einen fatalen Fehler — der Spieler ist endgültig raus

Gesperrtes Handy, WLAN→LTE-Wechsel, kurzer Funkloch-Moment: Timeline futsch.

**Problem 2: Ein Host-Reload killt den Raum.**

`p2p/connection.ts` `handleUnload` schickt auf `pagehide` ein `{t:"leave"}`, der
Server behandelt einen Host-Leave als *graceful* und schließt den Raum sofort.
Die 30-Sekunden-Grace-Period greift nur beim harten Socket-Abriss. Und selbst
wenn sie griffe: `HostSession` lebt ausschließlich im RAM, der Room-State wäre
trotzdem weg.

**Lösung**

- **Disconnect ≠ Ausscheiden.** `Player.connected` plus Grace-Timer in der
  `HostSession`. Der Spieler bleibt mit Timeline im Raum, wird nur als getrennt
  markiert und erst nach Ablauf der Grace entfernt. Sofort raus fliegt nur, wer
  bewusst verlässt oder noch in der Lobby ist.
- **Entschieden werden muss** je Rolle, was während der Trennung passiert:
  aktiver Spieler (Zug blockiert vs. überspringen), Buzzer (Buzz verfällt),
  Host (Grace des Relays).
- **Session-Persistenz auf dem Client:** `roomCode`, eigene Peer-ID, Rolle und
  Name überleben einen Reload, damit ein `rejoin` überhaupt möglich ist.
- **Host-State-Persistenz:** der Room wird auf dem Host-Gerät serialisiert
  (gedrosselt) und nach einem Reload rehydriert; Timer werden aus den absoluten
  Deadlines neu gestellt, fremde/veraltete Snapshots abgelehnt.
- **`pagehide` schickt kein `leave` mehr**, sondern schließt nur den Socket —
  damit greift die Grace-Period des Relays. Der explizite Verlassen-Button
  bleibt graceful.
- Der Relay bleibt dumm; ob er überhaupt etwas ändern muss, wird beim Bau geprüft.

## P1 – Timer-Offset und State-Versioning ✅

**Fremde Uhren.** `buzzDeadline` und `placeDeadline` sind absolute Epoch-ms vom
Host; jeder Peer rechnet mit seiner eigenen Uhr. Ein Gerät mit Uhrversatz zeigt
einen falschen Countdown und kann „abgelaufen" anzeigen, während der Host noch
zählt. Fix: `hostNow` reist im `GameState` mit, der Peer misst daraus einmalig
seinen Offset und rechnet alle Deadlines darüber.

**Keine Sequenznummer.** Ein verspäteter oder doppelter `game-state` — etwa
direkt nach einem Reconnect — kann einen neueren State überschreiben. Fix:
monotone `stateVersion`, Peers verwerfen ältere States.

Beide Felder werden in `validateGameState` nach dem bereits etablierten Muster
„ältere Hosts tolerieren" behandelt.

## P2 – Song-Schema an einer Stelle ✅

Ein neues Song-Feld muss heute an **vier** Stellen nachgezogen werden:

1. der Spotify-`fields`-Parameter in `streaming/providers/spotify/playlist.ts`
2. das `Song`-Interface in `game/types.ts`
3. `parseSong` in `p2p/protocol.ts`
4. `maskSong` in `buildGameState` in `game/logic.ts`

Vergisst man 3, verschwindet das Feld stumm an der Peer-Grenze. Vergisst man 4,
verrät es die Antwort. CLAUDE.md *warnt* davor, statt es zu lösen.

Lösung: ein kleines, handgeschriebenes Feld-Deskriptor-Modul, aus dem Parser,
Maske und Query-String abgeleitet werden. Keine neue Abhängigkeit — das Projekt
ist bewusst dependency-arm, zod ist keine Option. `Song` bleibt ein echtes,
striktes Interface. Ein Test beweist, dass die Stellen nicht mehr auseinander
driften können.

## P3 – Runden-Log, Recap, lokale Historie ✅

**Runden-Log.** `Room.rounds` mit einem `RoundRecord` pro Runde: Song mit echtem
Jahr, aktiver Spieler, gewählte Position, Verdikt, Blitz-Timeout, Guess samt
Ergebnis, Buzzer und ob der Klau saß, Skip. Geschrieben wird das pur in
`game/logic.ts`, aufgerufen an allen Stellen in `host.ts`, an denen eine Runde
endet — Reveal, Blitz-Timeout, Skip und der Auto-Advance nach einem Disconnect.

**Recap.** Ist das Spiel vorbei, baut der Host ein `GameRecap` und broadcastet
es. Vorher nicht: bis zum Spielende ist der Runden-Log die Antwort.

**Historie, local-first.** Neues Modul `src/history/` mit Store auf
AsyncStorage/localStorage, Ringpuffer über die letzten Spiele, Schema-Version
für spätere Migrationen und einer **puren** Aggregations-Schicht (ewige
Bestenliste, Trefferquote, Lieblingsjahrzehnt, Angstgegner, beste Runde), die
sich ohne React testen lässt.

**Identität: die Spotify-Account-ID — die das Gerät aber nie verlässt.** Der
Host broadcastet das Recap mit den gewohnten Peer-IDs; **jedes Gerät speichert
seinen eigenen Eintrag lokal** unter seiner eigenen Spotify-ID. Damit sieht
niemand im Raum die Accounts der anderen. Pass-and-Play-Spieler landen unter der
Identität des Host-Geräts mit ihrem Namen als Unterschlüssel. Fallback, wenn
`/me` mit dem nackten 403 antwortet (kommt seit Spotifys Februar-2026-Änderungen
vor): eine lokale UUID, die später zusammengeführt wird, sobald die Spotify-ID
doch auflösbar ist.

**UI.** Der Finished-Screen wird reicher, die bestehenden Awards ziehen künftig
aus dem Runden-Log statt aus den flachen Zählern, und eine neue Statistik-Route
zeigt Historie und Aggregate. Designrichtung bleibt ABFAHRT.

Ein Profil-/Account-System ist ausdrücklich **später** — das Datenmodell darf es
nur nicht verbauen.

---

## P4 – Jahres-Korrektur (auf Eis)

`extractYear(album.release_date)` in `streaming/providers/spotify/playlist.ts`
nimmt das Datum des Albums, auf dem der Track **in dieser Playlist** liegt. Bei
Remastern, Compilations und Greatest-Hits-Alben ist das die Neuveröffentlichung
statt des Originals — Bohemian Rhapsody aus einer 2011er-Best-Of ist dann 2011.
Das Spiel entscheidet Runden über diese Zahl.

**Zurückgestellt:** erst mehr Spiele spielen und sammeln, wie oft und wie stark
es tatsächlich danebenliegt. Ohne Datenbasis lässt sich weder der Aufwand noch
der richtige Weg beurteilen.

---

## P5 – Tote Songs: Messen läuft, Gratis-Ausweg fehlt noch

Manchmal lädt ein Song, spielt aber nicht — und der aktive Spieler muss einen
Token für den Skip opfern. Umgesetzt ist bisher nur die **Messschicht**:
`restrictions.reason` wird abgefragt und gefiltert, unbrauchbare Tracks (auch
Podcast-Episoden) fliegen raus, eine Ein-Request-Sonde zeigt dem Host in der
Lobby, wie viel von der Playlist auf seinem Account spielbar aussieht, und
`getFieldPresence()` zählt mit, ob Spotify die Felder überhaupt liefert.

**Warum erst messen:** `is_playable` ist optional. Fehlt es, filtert nichts —
und ob es fehlt, sagt die Doku nicht. Nach einem Spieleabend sagen es die Zähler.

**Offen, sobald die Zahlen da sind:**

- **Playback verifizieren.** Spotify quittiert `play` mit `204` = „Befehl
  angenommen", nicht „es läuft". `GET /me/player` (Scope haben wir) könnte
  ~1,5 s und ~4 s später nachsehen; zwei Messungen, weil eine kalt gestartete
  Spotify-App beim ersten Mal `204` antwortet.
- **Kostenloser Neuwurf.** Der eigentliche Wunsch. Muss vom Host entschieden
  werden (automatisch wenn dessen eigenes Playback tot ist, per Button wenn nur
  Peers melden) und gedeckelt sein, sonst ist es ein unbegrenzter Gratis-Skip.
- **Grenze akzeptieren:** Verfügbarkeit gilt pro Account. Ein Song kann beim
  Host laufen und bei einem Mitspieler tot sein — es gibt keinen Endpunkt, der
  „spielt das bei allen?" beantwortet. Vorbeugen ist Bonus, der Ausweg ist das
  Feature.

**Offene Entscheidung** — welcher Weg, wenn es so weit ist:

- **a) Spotify-Suche als Heuristik.** Pro Runde ein zusätzlicher
  `search?q=track:… artist:…`, das älteste Release desselben Tracks gewinnt.
  Kein neuer Dienst, keine neue Abhängigkeit, läuft im Hintergrund während der
  Song schon spielt. Nicht exakt, killt aber den Greatest-Hits-Fall.
- **b) Override-Tabelle im Repo.** Handgepflegte Korrekturen pro Track-ID für die
  Stamm-Playlists. Exakt und offline, dafür Pflegeaufwand.
- **c) MusicBrainz vom Client.** Genau, aber ein Request pro Sekunde Limit,
  eigener User-Agent und noch eine externe Abhängigkeit.
- **d) Server-Cache auf Railway.** Songjahre sind keine Nutzerdaten, ein Cache
  widerspräche der Local-first-Entscheidung für die Historie also nicht. Kostet
  aber einen Dienst, den wir sonst nicht bräuchten.

Tendenz: a) plus b) kombiniert. Das Runden-Log aus P3 liefert nebenbei genau die
Datenbasis, mit der sich das Ausmaß beziffern lässt.

---

## Was Railway sonst könnte (nicht eingeplant)

Der Container läuft ohnehin durchgehend — Serverless muss wegen der WebSockets
aus bleiben. Notiert für irgendwann, nichts davon ist für P0–P3 nötig:

- Raum-Snapshots serverseitig als zweites Netz für die Host-Recovery
- geteilter Playlist-/Track-Cache (spart Spotify-Rate-Limit, wäre auch der Ort
  für P4 d)
- `/tv/<code>` als reine Zuschauer-Ansicht für den Fernseher
- Join-Kurzlinks mit QR-Code in der Lobby
- Client-Logs als Fehler-Sink statt manuellem Log-Export

Der Relay bleibt dumm: keine Spielregeln in `server.js`.
