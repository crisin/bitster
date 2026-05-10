import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import Timeline from '../components/Timeline';
import PlayerList from '../components/PlayerList';

function Game() {
  const { roomCode } = useParams();
  const {
    players,
    phase,
    currentPlayerId,
    currentSongUri,
    lastResult,
    timelines,
    hostId,
    playerName,
    getSocket,
    joinRoom,
    emit,
  } = useGame();
  const { play, pause, isReady } = useSpotifyPlayer();
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const lastPlayedUri = useRef(null);

  useEffect(() => {
    if (roomCode) localStorage.setItem('lastRoom', roomCode);
    const socket = getSocket();
    if (!socket?.connected && playerName && roomCode) {
      joinRoom(roomCode, playerName);
    }
  }, [roomCode, playerName]);

  // Play song when a new round starts
  useEffect(() => {
    if (currentSongUri && isReady && currentSongUri !== lastPlayedUri.current) {
      lastPlayedUri.current = currentSongUri;
      play(currentSongUri);
    }
  }, [currentSongUri, isReady, play]);

  // Stop music on reveal
  useEffect(() => {
    if (phase === 'reveal') {
      pause();
    }
  }, [phase, pause]);

  // Reset placing guard on new round
  useEffect(() => {
    if (phase === 'playing') {
      setPlacing(false);
    }
  }, [phase]);

  // Send Spotify token to server once connected
  useEffect(() => {
    const socket = getSocket();
    const token = localStorage.getItem('spotify_access_token');
    if (socket?.connected && token && isReady) {
      socket.emit('spotify-token', { token });
    }
  }, [isReady, getSocket]);

  function handleStartGame() {
    if (!playlistUrl.trim()) return;
    setLoading(true);

    let playlistId = playlistUrl.trim();
    const urlMatch = playlistId.match(/playlist\/([a-zA-Z0-9]+)/);
    if (urlMatch) playlistId = urlMatch[1];

    const spotifyToken = localStorage.getItem('spotify_access_token');
    emit('start-game', { playlistId, spotifyToken }, (response) => {
      setLoading(false);
      if (!response.success) {
        alert(response.error || 'Failed to start game');
      }
    });
  }

  function handlePlaceSong(position) {
    if (placing) return;
    setPlacing(true);
    emit('place-song', { position });
  }

  function handleNextRound() {
    emit('next-round');
  }

  function handleConnectSpotify() {
    const serverUrl = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
    window.location.href = `${serverUrl}/auth/spotify`;
  }

  const socketId = getSocket()?.id;
  const isMyTurn = currentPlayerId === socketId;
  const activePlayerInfo = players.find((p) => p.id === currentPlayerId);
  const isHost = socketId === hostId;
  const myTimeline = timelines?.[socketId] || [];

  return (
    <div className="game">
      <div className="game-header">
        <h1 className="game-title">HITSTER</h1>
        <div className="room-code-display">
          <span className="room-label">Room</span>
          <span className="room-value">{roomCode}</span>
        </div>
      </div>

      <div className="game-layout">
        <aside className="sidebar">
          <PlayerList players={players} activePlayer={currentPlayerId} />

          {!isReady && (
            <button className="btn btn-spotify" onClick={handleConnectSpotify}>
              Connect Spotify
            </button>
          )}
          {isReady && <div className="spotify-connected">Spotify Connected</div>}

          {phase === 'lobby' && isHost && (
            <div className="start-section">
              <input
                type="text"
                placeholder="Spotify playlist URL"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                className="input"
              />
              <button
                className="btn btn-primary"
                onClick={handleStartGame}
                disabled={!playlistUrl.trim() || !isReady || loading}
                style={{ marginTop: '8px', width: '100%' }}
              >
                {loading ? 'Loading playlist...' : 'Start Game'}
              </button>
            </div>
          )}
          {phase === 'lobby' && !isHost && (
            <p className="hint">Waiting for host to start...</p>
          )}
        </aside>

        <main className="game-main">
          {phase === 'lobby' && (
            <div className="lobby-message">
              <h2>Waiting to start</h2>
              <p>Share the room code with friends to join!</p>
            </div>
          )}

          {phase === 'playing' && (
            <div className="playing-area">
              <div className="turn-indicator">
                {isMyTurn ? (
                  <h2 className="your-turn">Your turn! Place the song in your timeline.</h2>
                ) : (
                  <h2>{activePlayerInfo?.name || 'Someone'} is placing a song...</h2>
                )}
              </div>

              {currentSongUri && (
                <div className="now-playing">
                  <div className="playing-indicator">
                    <span className="bar"></span>
                    <span className="bar"></span>
                    <span className="bar"></span>
                    <span className="bar"></span>
                  </div>
                  <span>Song playing...</span>
                </div>
              )}

              <Timeline
                cards={myTimeline}
                onPlace={handlePlaceSong}
                interactive={isMyTurn && !placing}
              />
            </div>
          )}

          {phase === 'reveal' && lastResult && (
            <div className="reveal-area">
              <div className={`reveal-card ${lastResult.correct ? 'correct' : 'incorrect'}`}>
                <h2>{lastResult.correct ? 'Correct!' : 'Wrong!'}</h2>
                <div className="song-info">
                  <p className="song-title">{lastResult.songName}</p>
                  <p className="song-artist">{lastResult.songArtist}</p>
                  <p className="song-year">{lastResult.year}</p>
                </div>
              </div>

              <Timeline cards={myTimeline} onPlace={() => {}} interactive={false} />

              <button className="btn btn-primary" onClick={handleNextRound}>
                Next Round
              </button>
            </div>
          )}

          {phase === 'finished' && (
            <div className="game-over">
              <h2>Game Over!</h2>
              {(() => {
                const topPlayer = [...players].sort((a, b) => b.score - a.score)[0];
                if (!topPlayer) return null;
                return (
                  <p className="winner-text">
                    {topPlayer.id === socketId ? 'You win!' : `${topPlayer.name} wins!`}
                  </p>
                );
              })()}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Game;
