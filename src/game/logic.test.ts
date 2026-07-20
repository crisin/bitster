import { describe, it, expect } from "vitest";
import {
  generateRoomCode,
  createRoom,
  createPlayer,
  addPlayer,
  removePlayer,
  pickRandomSong,
  checkPlacement,
  placeSong,
  advanceTurn,
  checkWinCondition,
  getCurrentPlayer,
  startGame,
  buildGameState,
  undoPlacement,
  guessSongInfo,
} from "./logic";
import type { Song, Room } from "./types";

function makeSong(year: number, id?: string): Song {
  return {
    id: id ?? `song-${year}`,
    uri: `spotify:track:${id ?? year}`,
    name: `Song ${year}`,
    artist: `Artist ${year}`,
    year,
  };
}

function makeTestRoom(): Room {
  const room = createRoom("TEST01", "host-1", "Alice");
  return addPlayer(room, "peer-2", "Bob");
}

describe("generateRoomCode", () => {
  it("generates a 6-character code", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it("only uses valid characters (no 0, 1, I, O)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z2-9]+$/);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it("generates different codes", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(15);
  });
});

describe("createRoom", () => {
  it("creates a room with host as first player", () => {
    const room = createRoom("ABC123", "host-1", "Alice");
    expect(room.code).toBe("ABC123");
    expect(room.hostId).toBe("host-1");
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe("Alice");
    expect(room.phase).toBe("lobby");
    expect(room.settings.winScore).toBe(10);
    expect(room.settings.maxPlayers).toBe(8);
  });

  it("accepts custom settings", () => {
    const room = createRoom("ABC123", "host-1", "Alice", { winScore: 5 });
    expect(room.settings.winScore).toBe(5);
    expect(room.settings.maxPlayers).toBe(8);
  });
});

describe("addPlayer", () => {
  it("adds a new player", () => {
    const room = createRoom("ABC123", "host-1", "Alice");
    const updated = addPlayer(room, "peer-2", "Bob");
    expect(updated.players).toHaveLength(2);
    expect(updated.players[1].name).toBe("Bob");
  });

  it("reconnects existing player by peer ID — updates name", () => {
    const room = createRoom("ABC123", "host-1", "Alice");
    const withBob = addPlayer(room, "peer-2", "Bob");
    const reconnected = addPlayer(withBob, "peer-2", "Bobby");
    expect(reconnected.players).toHaveLength(2);
    expect(reconnected.players[1].id).toBe("peer-2");
    expect(reconnected.players[1].name).toBe("Bobby");
  });

  it("throws when room is full", () => {
    let room = createRoom("ABC123", "host-1", "Alice", { maxPlayers: 2 });
    room = addPlayer(room, "peer-2", "Bob");
    expect(() => addPlayer(room, "peer-3", "Charlie")).toThrow("Room is full");
  });

  it("throws when game is finished", () => {
    let room = createRoom("ABC123", "host-1", "Alice");
    room = { ...room, phase: "finished" };
    expect(() => addPlayer(room, "peer-2", "Bob")).toThrow("already finished");
  });

  it("throws for a new player when game is in progress", () => {
    let room = makeTestRoom();
    room = { ...room, phase: "playing" };
    expect(() => addPlayer(room, "peer-3", "Charlie")).toThrow(
      "already in progress"
    );
  });

  it("still reconnects an existing player mid-game", () => {
    let room = makeTestRoom();
    room = { ...room, phase: "playing" };
    const reconnected = addPlayer(room, "peer-2", "Bob");
    expect(reconnected.players).toHaveLength(2);
  });
});

describe("removePlayer", () => {
  it("removes a player", () => {
    const room = makeTestRoom();
    const updated = removePlayer(room, "peer-2");
    expect(updated.players).toHaveLength(1);
  });

  it("transfers host when host leaves", () => {
    const room = makeTestRoom();
    const updated = removePlayer(room, "host-1");
    expect(updated.hostId).toBe("peer-2");
  });

  it("adjusts currentPlayerIndex when earlier player removed", () => {
    let room = makeTestRoom();
    room = addPlayer(room, "peer-3", "Charlie");
    room = { ...room, currentPlayerIndex: 2 };
    const updated = removePlayer(room, "host-1");
    expect(updated.currentPlayerIndex).toBe(1);
  });
});

describe("checkPlacement", () => {
  it("returns true for empty timeline", () => {
    expect(checkPlacement([], makeSong(2000), 0)).toBe(true);
  });

  it("returns true for correct placement at start", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(1990), 0)).toBe(true);
  });

  it("returns true for correct placement at end", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(2010), 1)).toBe(true);
  });

  it("returns true for correct placement in middle", () => {
    const timeline = [makeSong(1990), makeSong(2010)];
    expect(checkPlacement(timeline, makeSong(2000), 1)).toBe(true);
  });

  it("returns false for wrong placement (too early)", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(2010), 0)).toBe(false);
  });

  it("returns false for wrong placement (too late)", () => {
    const timeline = [makeSong(2000)];
    expect(checkPlacement(timeline, makeSong(1990), 1)).toBe(false);
  });

  it("allows same year at any position", () => {
    const timeline = [makeSong(2000, "a"), makeSong(2000, "b")];
    expect(checkPlacement(timeline, makeSong(2000, "c"), 0)).toBe(true);
    expect(checkPlacement(timeline, makeSong(2000, "d"), 1)).toBe(true);
    expect(checkPlacement(timeline, makeSong(2000, "e"), 2)).toBe(true);
  });
});

describe("placeSong", () => {
  it("places song correctly and updates score", () => {
    let room = makeTestRoom();
    const songs = [makeSong(2000), makeSong(1990)];
    room = startGame(room, songs);
    room = { ...room, currentSong: makeSong(2000) };

    const { room: updated, result } = placeSong(room, "host-1", 0);
    expect(result.correct).toBe(true);
    expect(updated.players[0].timeline).toHaveLength(1);
    expect(updated.players[0].score).toBe(1);
    expect(updated.phase).toBe("hitster-window");
  });

  it("tentatively adds song to timeline even on wrong placement", () => {
    let room = makeTestRoom();
    room = startGame(room, [makeSong(2000), makeSong(1990)]);
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1" ? { ...p, timeline: [makeSong(2000)] } : p
      ),
      currentSong: makeSong(1990),
    };

    const { room: updated, result } = placeSong(room, "host-1", 1);
    expect(result.correct).toBe(false);
    // Card is tentatively added (removed during reveal if wrong)
    expect(updated.players[0].timeline).toHaveLength(2);
    expect(updated.phase).toBe("hitster-window");
  });

  it("throws for unknown player", () => {
    let room = makeTestRoom();
    room = { ...room, currentSong: makeSong(2000) };
    expect(() => placeSong(room, "unknown", 0)).toThrow("Player not found");
  });
});

describe("advanceTurn", () => {
  it("cycles to next player", () => {
    const room = makeTestRoom();
    const advanced = advanceTurn(room);
    expect(advanced.currentPlayerIndex).toBe(1);
    expect(advanced.phase).toBe("playing");
    expect(advanced.currentSong).toBeNull();
  });

  it("wraps around to first player", () => {
    let room = makeTestRoom();
    room = { ...room, currentPlayerIndex: 1 };
    const advanced = advanceTurn(room);
    expect(advanced.currentPlayerIndex).toBe(0);
  });
});

describe("pickRandomSong", () => {
  it("picks from unplayed songs", () => {
    let room = makeTestRoom();
    room = { ...room, playlist: [makeSong(2000), makeSong(1990)] };
    const result = pickRandomSong(room);
    expect(result).not.toBeNull();
    expect(result!.song).toBeDefined();
    expect(result!.room.playedSongs).toHaveLength(1);
  });

  it("returns null when all songs played", () => {
    let room = makeTestRoom();
    const song = makeSong(2000);
    room = { ...room, playlist: [song], playedSongs: [song] };
    expect(pickRandomSong(room)).toBeNull();
  });
});

describe("checkWinCondition", () => {
  it("returns null when no winner", () => {
    const room = makeTestRoom();
    expect(checkWinCondition(room)).toBeNull();
  });

  it("returns winning player", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1" ? { ...p, score: 10 } : p
      ),
    };
    const winner = checkWinCondition(room);
    expect(winner).not.toBeNull();
    expect(winner!.name).toBe("Alice");
  });
});

describe("startGame", () => {
  it("resets scores and timelines", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      players: room.players.map((p) => ({
        ...p,
        score: 5,
        timeline: [makeSong(2000)],
      })),
    };
    const playlist = [makeSong(2000), makeSong(1990)];
    const started = startGame(room, playlist);
    expect(started.phase).toBe("playing");
    expect(started.playlist).toHaveLength(2);
    expect(started.players[0].score).toBe(0);
    expect(started.players[0].timeline).toHaveLength(0);
    expect(started.playedSongs).toHaveLength(0);
  });
});

describe("getCurrentPlayer", () => {
  it("returns current player", () => {
    const room = makeTestRoom();
    expect(getCurrentPlayer(room)?.name).toBe("Alice");
  });
});

describe("buildGameState", () => {
  it("builds serializable game state", () => {
    const room = makeTestRoom();
    const state = buildGameState(room);
    expect(state.roomCode).toBe("TEST01");
    expect(state.players).toHaveLength(2);
    expect(state.phase).toBe("lobby");
    expect(state.hostId).toBe("host-1");
    expect(state.timelines).toBeDefined();
  });

  it("does not leak the current song via playedSongs while guessing", () => {
    const song = makeSong(1999, "secret");
    let room = makeTestRoom();
    room = {
      ...room,
      phase: "playing",
      currentSong: song,
      playedSongs: [makeSong(1980, "old"), song],
    };
    const state = buildGameState(room);
    expect(state.playedSongs).toHaveLength(1);
    expect(state.playedSongs[0].name).toBe("Song 1980");
  });

  it("masks the current song's year in timelines during hitster-window", () => {
    const song = makeSong(1999, "secret");
    let room = makeTestRoom();
    room = {
      ...room,
      phase: "hitster-window",
      currentSong: song,
      players: room.players.map((p) =>
        p.id === "host-1"
          ? { ...p, timeline: [makeSong(1980, "old"), song] }
          : p
      ),
    };
    const state = buildGameState(room);
    const years = state.timelines["host-1"].map((s) => s.year);
    expect(years).toEqual([1980, 0]);
    // playedSongs must not contain it either
    expect(state.playedSongs.some((s) => s.name === song.name)).toBe(false);
  });

  it("includes the current song again from reveal on", () => {
    const song = makeSong(1999, "secret");
    let room = makeTestRoom();
    room = {
      ...room,
      phase: "reveal",
      currentSong: song,
      playedSongs: [song],
    };
    const state = buildGameState(room);
    expect(state.playedSongs).toHaveLength(1);
    expect(state.playedSongs[0].year).toBe(1999);
  });
});

describe("undoPlacement", () => {
  it("removes a tentatively placed song from timeline", () => {
    let room = makeTestRoom();
    const song = makeSong(2000);
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1"
          ? { ...p, timeline: [song, makeSong(1990)], score: 2 }
          : p
      ),
    };
    const updated = undoPlacement(room, "host-1", song.id);
    expect(updated.players[0].timeline).toHaveLength(1);
    expect(updated.players[0].score).toBe(1);
  });

  it("does nothing if song not in timeline", () => {
    let room = makeTestRoom();
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === "host-1" ? { ...p, timeline: [makeSong(2000)], score: 1 } : p
      ),
    };
    const updated = undoPlacement(room, "host-1", "nonexistent");
    expect(updated.players[0].timeline).toHaveLength(1);
  });
});

describe("guessSongInfo — fuzzy matching", () => {
  function makeRoomWithSong(name: string, artist: string): Room {
    let room = makeTestRoom();
    room = startGame(room, []);
    room = {
      ...room,
      currentSong: { id: "test", uri: "test:1", name, artist, year: 2000 },
    };
    return room;
  }

  it("awards 1 token when both title and artist correct", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    const { titleCorrect, artistCorrect, room: updated } = guessSongInfo(
      room, "host-1", "Blinding Lights", "The Weeknd"
    );
    expect(titleCorrect).toBe(true);
    expect(artistCorrect).toBe(true);
    expect(updated.players[0].tokens).toBe(3); // 2 starting + 1
  });

  it("awards 0 tokens when only title correct", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    const { titleCorrect, artistCorrect, room: updated } = guessSongInfo(
      room, "host-1", "Blinding Lights", "Drake"
    );
    expect(titleCorrect).toBe(true);
    expect(artistCorrect).toBe(false);
    expect(updated.players[0].tokens).toBe(2); // unchanged
  });

  it("matches single artist from multi-artist credit", () => {
    const room = makeRoomWithSong("Song", "Drake, Future, Young Thug");
    expect(guessSongInfo(room, "host-1", "Song", "Drake").artistCorrect).toBe(true);
    expect(guessSongInfo(room, "host-1", "Song", "Future").artistCorrect).toBe(true);
    expect(guessSongInfo(room, "host-1", "Song", "Young Thug").artistCorrect).toBe(true);
  });

  it("matches artist from feat. credit", () => {
    const room = makeRoomWithSong("Song", "Eminem feat. Rihanna");
    expect(guessSongInfo(room, "host-1", "Song", "Eminem").artistCorrect).toBe(true);
    expect(guessSongInfo(room, "host-1", "Song", "Rihanna").artistCorrect).toBe(true);
  });

  it("matches space-separated multi-artist guess", () => {
    const room = makeRoomWithSong("Song", "Eminem ft. Rihanna");
    // "Eminem Rihanna" normalizes to "eminemrihanna" which contains "eminem"
    expect(guessSongInfo(room, "host-1", "Song", "Eminem Rihanna").artistCorrect).toBe(true);
  });

  it("matches slash-separated multi-artist guess", () => {
    const room = makeRoomWithSong("Song", "Eminem ft. Rihanna");
    expect(guessSongInfo(room, "host-1", "Song", "eminem/rihanna").artistCorrect).toBe(true);
  });

  it("is case insensitive", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    const result = guessSongInfo(room, "host-1", "blinding lights", "the weeknd");
    expect(result.titleCorrect).toBe(true);
    expect(result.artistCorrect).toBe(true);
  });

  it("forgives small typos in longer titles", () => {
    const room = makeRoomWithSong("Bohemian Rhapsody", "Queen");
    expect(guessSongInfo(room, "host-1", "Bohemian Rapsody", "Queen").titleCorrect).toBe(true);
    expect(guessSongInfo(room, "host-1", "Bohemien Rapsody", "Queen").titleCorrect).toBe(true);
  });

  it("forgives transposed letters", () => {
    const room = makeRoomWithSong("Blinding Lights", "The Weeknd");
    expect(guessSongInfo(room, "host-1", "Blidning Lights", "Teh Weeknd").titleCorrect).toBe(true);
    expect(guessSongInfo(room, "host-1", "Blidning Lights", "Teh Weeknd").artistCorrect).toBe(true);
  });

  it("forgives typos in artist names", () => {
    const room = makeRoomWithSong("Song", "Nirvana");
    expect(guessSongInfo(room, "host-1", "Song", "Nirvna").artistCorrect).toBe(true);
    expect(guessSongInfo(room, "host-1", "Song", "Nirvanna").artistCorrect).toBe(true);
  });

  it("keeps short titles strict — no tolerance under 5 characters", () => {
    const room = makeRoomWithSong("Yo", "Artist Somebody");
    expect(guessSongInfo(room, "host-1", "No", "Artist Somebody").titleCorrect).toBe(false);
  });

  it("does not match a genuinely different title", () => {
    const room = makeRoomWithSong("Hello", "Adele");
    expect(guessSongInfo(room, "host-1", "Hollow", "Adele").titleCorrect).toBe(false);
    expect(guessSongInfo(room, "host-1", "Wonderwall", "Adele").titleCorrect).toBe(false);
  });

  it("does not stretch tolerance across large length differences", () => {
    const room = makeRoomWithSong("Smells Like Teen Spirit", "Nirvana");
    expect(guessSongInfo(room, "host-1", "Smells", "Nirvana").titleCorrect).toBe(false);
    expect(guessSongInfo(room, "host-1", "Smels Like Teen Spirit", "Nirvana").titleCorrect).toBe(true);
  });

  it("strips remix suffix from title", () => {
    const room = makeRoomWithSong("Blinding Lights (Remix)", "The Weeknd");
    expect(guessSongInfo(room, "host-1", "Blinding Lights", "The Weeknd").titleCorrect).toBe(true);
  });

  it("strips feat. from title", () => {
    const room = makeRoomWithSong("HUMBLE. (feat. Someone)", "Kendrick Lamar");
    expect(guessSongInfo(room, "host-1", "HUMBLE", "Kendrick Lamar").titleCorrect).toBe(true);
  });

  it("strips dash-suffix from title", () => {
    const room = makeRoomWithSong("Song - Remastered 2021", "Artist");
    expect(guessSongInfo(room, "host-1", "Song", "Artist").titleCorrect).toBe(true);
  });

  it("handles ß vs ss", () => {
    const room = makeRoomWithSong("Straße", "Artist");
    expect(guessSongInfo(room, "host-1", "Strasse", "Artist").titleCorrect).toBe(true);
  });

  it("handles diacritics", () => {
    const room = makeRoomWithSong("Déjà Vu", "Artist");
    expect(guessSongInfo(room, "host-1", "Deja Vu", "Artist").titleCorrect).toBe(true);
  });

  it("rejects empty guess", () => {
    const room = makeRoomWithSong("Song", "Artist");
    expect(guessSongInfo(room, "host-1", "", "").titleCorrect).toBe(false);
    expect(guessSongInfo(room, "host-1", "", "").artistCorrect).toBe(false);
  });
});
