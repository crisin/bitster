const gameManager = require('../services/gameManager');
const { getPlaylistTracks } = require('../services/spotify');

function setupGameSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join-room', ({ roomCode, playerName }, cb) => {
      try {
        const room = gameManager.joinRoom(roomCode, socket.id, playerName);

        socket.join(roomCode);
        socket.data.roomCode = roomCode;

        emitRoomState(io, room);

        if (cb) cb({ success: true, room: sanitizeRoom(room) });
      } catch (err) {
        if (cb) cb({ success: false, error: err.message });
      }
    });

    socket.on('create-room', ({ playerName }, cb) => {
      try {
        const roomCode = gameManager.createRoom(socket.id);
        const room = gameManager.joinRoom(roomCode, socket.id, playerName);

        socket.join(roomCode);
        socket.data.roomCode = roomCode;

        if (cb) cb({ success: true, roomCode, room: sanitizeRoom(room) });
      } catch (err) {
        if (cb) cb({ success: false, error: err.message });
      }
    });

    socket.on('spotify-token', ({ token }) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      const room = gameManager.getRoom(roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (player) player.spotifyToken = token;
    });

    socket.on('start-game', async ({ playlistId, spotifyToken }, cb) => {
      try {
        const roomCode = socket.data.roomCode;
        const room = gameManager.getRoom(roomCode);
        if (!room) throw new Error('Room not found');
        if (room.status === 'playing') throw new Error('Game already in progress');
        if (room.players.length < 1) throw new Error('Not enough players');

        const token = spotifyToken || room.players.find((p) => p.id === socket.id)?.spotifyToken;
        if (!token) throw new Error('Connect Spotify first');

        const tracks = await getPlaylistTracks(playlistId, token);
        if (tracks.length === 0) throw new Error('Playlist has no valid tracks');

        room.playlist = tracks;
        room.playedSongs = [];
        room.currentPlayerIndex = 0;
        room.status = 'playing';
        room.phase = 'playing';

        for (const p of room.players) {
          p.timeline = [];
          p.score = 0;
        }

        const song = gameManager.pickRandomSong(roomCode);

        io.to(roomCode).emit('game-state', buildGameState(room));

        if (cb) cb({ success: true });
      } catch (err) {
        if (cb) cb({ success: false, error: err.message });
      }
    });

    socket.on('place-song', ({ position }, cb) => {
      try {
        const roomCode = socket.data.roomCode;
        const room = gameManager.getRoom(roomCode);
        if (!room) throw new Error('Room not found');
        if (room.status !== 'playing') throw new Error('Game is not in progress');
        if (room.phase !== 'playing') throw new Error('Not in placement phase');

        const currentPlayer = room.players[room.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) {
          throw new Error('It is not your turn');
        }

        const { correct, year } = gameManager.checkPlacement(roomCode, socket.id, position);

        room.phase = 'reveal';
        room.lastResult = {
          correct,
          year,
          songName: room.currentSong.name,
          songArtist: room.currentSong.artist,
          playerId: socket.id,
        };

        const winner = gameManager.checkWinCondition(roomCode);
        if (winner) {
          room.status = 'finished';
          room.phase = 'finished';
        }

        io.to(roomCode).emit('game-state', buildGameState(room));

        if (cb) cb({ success: true, correct, year });
      } catch (err) {
        if (cb) cb({ success: false, error: err.message });
      }
    });

    socket.on('next-round', (_, cb) => {
      try {
        const roomCode = socket.data.roomCode;
        const room = gameManager.getRoom(roomCode);
        if (!room) throw new Error('Room not found');
        if (room.status !== 'playing') throw new Error('Game is not in progress');
        if (room.phase !== 'reveal') throw new Error('Not in reveal phase');

        gameManager.advanceTurn(roomCode);
        const song = gameManager.pickRandomSong(roomCode);

        if (!song) {
          room.status = 'finished';
          room.phase = 'finished';
          io.to(roomCode).emit('game-state', buildGameState(room));
          if (cb) cb({ success: true, finished: true });
          return;
        }

        room.phase = 'playing';
        room.lastResult = null;

        io.to(roomCode).emit('game-state', buildGameState(room));

        if (cb) cb({ success: true });
      } catch (err) {
        if (cb) cb({ success: false, error: err.message });
      }
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      const room = gameManager.getRoom(roomCode);
      if (!room) return;

      room.players = room.players.filter((p) => p.id !== socket.id);

      if (room.players.length === 0) {
        if (room._deleteTimeout) clearTimeout(room._deleteTimeout);
        room._deleteTimeout = setTimeout(() => {
          const r = gameManager.getRoom(roomCode);
          if (r && r.players.length === 0) gameManager.deleteRoom(roomCode);
        }, 60000);
        return;
      }

      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }
      if (room.currentPlayerIndex >= room.players.length) {
        room.currentPlayerIndex = 0;
      }

      emitRoomState(io, room);
    });
  });
}

function buildGameState(room) {
  const currentPlayer = room.players[room.currentPlayerIndex];
  return {
    status: room.status,
    phase: room.phase || (room.status === 'waiting' ? 'lobby' : room.status),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      timelineLength: p.timeline.length,
    })),
    currentPlayerId: currentPlayer?.id || null,
    currentSongUri: room.phase === 'playing' && room.currentSong ? room.currentSong.uri : null,
    lastResult: room.lastResult || null,
    timelines: Object.fromEntries(
      room.players.map((p) => [
        p.id,
        p.timeline.map((t) => ({ name: t.name, artist: t.artist, year: t.year })),
      ])
    ),
    hostId: room.hostId,
  };
}

function emitRoomState(io, room) {
  io.to(room.code).emit('room-state', {
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
    })),
    hostId: room.hostId,
    status: room.status,
  });
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
    })),
    status: room.status,
    settings: room.settings,
  };
}

module.exports = { setupGameSocket };
