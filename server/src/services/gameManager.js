const { v4: uuidv4 } = require('uuid');

class GameManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /**
   * Generate a random 6-character uppercase room code.
   */
  _generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code;
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * Create a new room and add the host as the first player.
   */
  createRoom(hostId) {
    const code = this._generateCode();
    const room = {
      code,
      hostId,
      players: [],
      currentSong: null,
      playlist: [],
      playedSongs: [],
      currentPlayerIndex: 0,
      status: 'waiting',
      settings: {
        winScore: 10,
        maxPlayers: 8,
      },
    };
    this.rooms.set(code, room);
    return code;
  }

  /**
   * Add a player to an existing room.
   */
  joinRoom(roomCode, playerId, playerName) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.status === 'finished') {
      throw new Error('Game is finished');
    }
    if (room.players.length >= room.settings.maxPlayers && !room.players.some((p) => p.id === playerId)) {
      throw new Error('Room is full');
    }

    // Cancel any pending room deletion
    if (room._deleteTimeout) {
      clearTimeout(room._deleteTimeout);
      room._deleteTimeout = null;
    }

    const existing = room.players.find((p) => p.name === playerName);
    if (existing) {
      // Reconnect: update socket id
      existing.id = playerId;
      return room;
    }

    if (room.status === 'playing') {
      throw new Error('Game already in progress');
    }

    room.players.push({
      id: playerId,
      name: playerName,
      timeline: [],
      score: 0,
      spotifyToken: null,
    });

    return room;
  }

  /**
   * Get a room by its code.
   */
  getRoom(roomCode) {
    return this.rooms.get(roomCode) || null;
  }

  /**
   * Pick a random unplayed song from the playlist.
   * Returns null if all songs have been played.
   */
  pickRandomSong(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const available = room.playlist.filter(
      (track) => !room.playedSongs.includes(track.uri)
    );
    if (available.length === 0) return null;

    const index = Math.floor(Math.random() * available.length);
    const song = available[index];
    room.playedSongs.push(song.uri);
    room.currentSong = song;
    return song;
  }

  /**
   * Check if placing a song at the given position in the player's timeline
   * maintains chronological order by year.
   *
   * @param {string} roomCode
   * @param {string} playerId
   * @param {number} position - index at which the song would be inserted
   * @returns {{ correct: boolean, year: number }}
   */
  checkPlacement(roomCode, playerId, position) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.currentSong) {
      throw new Error('No active song to place');
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    const song = room.currentSong;
    const timeline = player.timeline;

    // Build what the timeline would look like after insertion
    const yearBefore = position > 0 ? timeline[position - 1].year : -Infinity;
    const yearAfter =
      position < timeline.length ? timeline[position].year : Infinity;

    const correct = song.year >= yearBefore && song.year <= yearAfter;

    if (correct) {
      timeline.splice(position, 0, {
        name: song.name,
        artist: song.artist,
        year: song.year,
        uri: song.uri,
      });
      player.score = timeline.length;
    }

    return { correct, year: song.year };
  }

  /**
   * Advance to the next player's turn.
   */
  advanceTurn(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    room.currentPlayerIndex =
      (room.currentPlayerIndex + 1) % room.players.length;
    return room.currentPlayerIndex;
  }

  /**
   * Check if any player has reached the win score.
   */
  checkWinCondition(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const winner = room.players.find(
      (p) => p.score >= room.settings.winScore
    );
    if (winner) {
      room.status = 'finished';
      return winner;
    }
    return null;
  }

  /**
   * Remove a room from memory.
   */
  deleteRoom(roomCode) {
    this.rooms.delete(roomCode);
  }
}

module.exports = new GameManager();
