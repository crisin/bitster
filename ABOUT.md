# bitster

**The music timeline party game — now on your phone.**

You hear a song. You _know_ this song. But... was it 2003 or 2007?
Place it in your timeline. Get it right, keep it. Get it wrong, suffer in silence.

First to (+/-)10 songs wins. Simple as that.

---

## How it works

1. Someone creates a room and shares the code
2. Everyone joins, connects their Spotify, and picks a device
3. A song plays on _everyone's_ phone at the same time
4. The active player drags it into their timeline — before or after their other songs, sorted by year
5. Nailed it? The card stays. Fumbled? Gone forever.
6. But wait — if you're _not_ the active player and you think you know the answer, you can smash the **bitster** button, steal the round, and place it yourself

Repeat until someone hits 10. Then rematch, obviously.

---

## One host, one dumb pipe

bitster's game brain runs **on the players' devices**, not in the cloud:

- One player is the **host** — their device runs the game logic and keeps score
- Everyone else sends their moves to the host and gets the game state back
- A tiny relay server passes the messages along — it knows rooms, not rules

Think of it like a board game: one person owns the box and keeps track of the rules, but everyone plays together. Except the box is an app. And the board is vibes.

The connection is a plain **WebSocket** to the same place the app is served from — no accounts, no game database, nothing stored server-side. If the host drops off briefly, the room waits for them to come back.

---

## What you need

- A Spotify Premium account (everyone needs one)
- The Spotify app installed on whatever device you want music on
- A friend group with questionable music knowledge

---

_Built with love, chaos, and massive amounts of caffeine._
