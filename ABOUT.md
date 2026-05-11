# Hitster

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
6. But wait — if you're _not_ the active player and you think you know the answer, you can smash the **HITSTER** button, steal the round, and place it yourself

Repeat until someone hits 10. Then rematch, obviously.

---

## No server, no problem

Hitster runs **peer-to-peer**. There's no server sitting in a data center somewhere. Instead:

- One player is the **host** — their phone runs the game logic and keeps score
- Everyone else connects directly to the host over the internet
- When something happens (a song is placed, a round advances), the host tells everyone

Think of it like a board game: one person owns the box and keeps track of the rules, but everyone plays together. Except the box is an app. And the board is vibes.

The connection works through **WebRTC** — the same tech that powers video calls — so it's fast, direct, and doesn't need a server to relay messages. Players find each other through a quick handshake, then talk directly device-to-device.

---

## What you need

- A Spotify Premium account (everyone needs one)
- The Spotify app installed on whatever device you want music on
- A friend group with questionable music knowledge

---

_Built with love, chaos, and an mass amounts of mass amounts of mass amounts of mass amounts of mass amounts of mass amounts of mass amounts of mass amounts of caffeine._
