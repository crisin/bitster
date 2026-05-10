import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';

function Home() {
  const [name, setName] = useState(() => localStorage.getItem('playerName') || '');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { createRoom, joinRoom } = useGame();

  function handleCreate() {
    if (!name.trim()) return;
    setError('');
    createRoom(name.trim(), (response) => {
      if (response.success) {
        navigate(`/game/${response.roomCode}`);
      } else {
        setError(response.error || 'Failed to create room');
      }
    });
  }

  function handleJoin() {
    if (!name.trim() || !roomCode.trim()) return;
    setError('');
    const code = roomCode.trim().toUpperCase();
    joinRoom(code, name.trim(), (response) => {
      if (response.success) {
        navigate(`/game/${code}`);
      } else {
        setError(response.error || 'Failed to join room');
      }
    });
  }

  return (
    <div className="home">
      <div className="home-container">
        <h1 className="logo">HITSTER</h1>
        <p className="tagline">Place the song in your timeline. First to 10 wins.</p>

        <div className="form-group">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            maxLength={20}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        {mode === null && (
          <div className="button-group">
            <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim()}>
              Create Room
            </button>
            <button className="btn btn-secondary" onClick={() => setMode('join')} disabled={!name.trim()}>
              Join Room
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="join-form">
            <input
              type="text"
              placeholder="Room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="input"
              maxLength={6}
              autoFocus
            />
            <div className="button-group">
              <button className="btn btn-primary" onClick={handleJoin} disabled={!roomCode.trim()}>
                Join
              </button>
              <button className="btn btn-ghost" onClick={() => setMode(null)}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
