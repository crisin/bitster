# Hitster – TODO

## Critical (Spiel bricht sonst ab)

- [ ] **Spotify Token Refresh** – Token läuft nach 1h ab, danach geht nichts mehr. `refreshToken()` existiert im Server aber wird nie aufgerufen. Client muss Token rechtzeitig refreshen oder Server übernimmt das.
- [ ] **Socket Reconnect** – Bei Verbindungsabbruch (Netzwerk, Handy-Standby) bleibt das Spiel hängen. Client braucht Auto-Reconnect mit State-Sync. Aktuell kein `disconnect`-Listener im GameContext.
- [ ] **Play-Fehler abfangen** – Wenn `play()` fehlschlägt (Token abgelaufen, kein Premium, Gerät weg), zeigt die UI trotzdem "Song playing..." an. Fetch-Response prüfen und Fehler anzeigen.

## High Priority (Spielbarkeit)

- [ ] **Hitster-Einwurf ("Buzzer")** – Wenn ein anderer Spieler denkt, er weiß wo der Song hingehört, kann er "Hitster!" rufen. Wenn er richtig liegt, bekommt er den Song in seine Timeline statt des aktiven Spielers. Wenn falsch, kriegt er eine Strafkarte.
- [ ] **Eigene Timeline vs. Gegner-Timelines** – Aktuell sieht jeder nur seine eigene Timeline. Option zum Anschauen der Gegner-Timelines (read-only) wäre hilfreich.
- [ ] **Song-Preview statt Vollplayback** – Nur 30s abspielen, nicht den ganzen Song. Timer-Anzeige wie lange noch läuft.
- [ ] **Platzierung bestätigen** – Aktuell wird sofort platziert bei Klick auf "+". Besser: erst Position markieren, dann "Bestätigen"-Button. Verhindert Fehlklicks.
- [ ] **Game Settings** – Win-Score (aktuell hardcoded 10), Playlist-Größe, Timer pro Runde konfigurierbar machen. UI im Lobby.
- [ ] **Room-Code kopieren** – Copy-Button neben dem Room-Code, idealerweise mit Share-Link.
- [ ] **Spieler kicken** – Host kann Spieler aus dem Raum entfernen.
- [ ] **Neues Spiel starten** – Nach Game Over "Rematch"-Button, ohne neuen Raum erstellen zu müssen.

## Medium Priority (Robustheit)

- [ ] **Token nicht in URL** – Spotify-Tokens werden aktuell als URL-Parameter übergeben (sichtbar in Browser-History, Logs). Stattdessen: serverseitige Session oder HTTP-only Cookie.
- [ ] **Error Boundary** – React Error Boundary um die App, damit bei einem Crash nicht alles weiß wird.
- [ ] **Bessere Fehlermeldungen** – "Connect Spotify first" sagt nicht wie. "Playlist has no valid tracks" sagt nicht warum. Konkrete Hinweise anzeigen.
- [ ] **Loading-States** – Spotify-Verbindung, Song laden, Runde wechseln – überall Spinner/Feedback fehlt.
- [ ] **Input-Validierung** – Playlist-URL validieren bevor API-Call, Position-Bounds prüfen bei `place-song`, Spielernamen sanitizen (XSS).
- [ ] **Disconnect-Handling im Spiel** – Wenn der aktive Spieler disconnected, Runde automatisch skippen nach Timeout. Aktuell hängt das Spiel.
- [ ] **Mehrfach-Next-Round verhindern** – Wenn beide Spieler gleichzeitig "Next Round" drücken, könnte eine Runde übersprungen werden. Server muss Guard haben.

## Nice to Have (Zukunft)

- [ ] **Mobile Support** – Timeline horizontal scrollbar auf kleinen Screens, Touch-Targets vergrößern.
- [ ] **Spectator Mode** – Zuschauen ohne mitzuspielen.
- [ ] **Chat / Reactions** – Emoji-Reactions oder Text-Chat im Spiel.
- [ ] **Sound-Effekte** – Richtig/Falsch-Sounds beim Reveal.
- [ ] **Animationen** – Karte fliegt in die Timeline, Confetti bei richtig.
- [ ] **Statistiken** – Runden-History, Trefferquote, meistgespielte Songs.
- [ ] **Playlist-Vorschau** – Anzahl Songs anzeigen bevor das Spiel startet.
- [ ] **Mehrere Playlists** – Playlists kombinieren für mehr Vielfalt.
- [ ] **Persistenz** – Spielstand in DB speichern, damit Server-Restart das Spiel nicht killt.
- [ ] **Pause-Funktion** – Spiel pausieren wenn jemand kurz AFK ist.
- [ ] **Dark/Light Theme** – Theme-Toggle.
