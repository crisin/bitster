function PlayerList({ players = [], activePlayer }) {
  return (
    <div className="player-list">
      <h3 className="player-list-title">Players</h3>
      <ul>
        {players.map((player) => (
          <li
            key={player.id}
            className={`player-item ${player.id === activePlayer ? 'active' : ''}`}
          >
            <span className="player-name">{player.name}</span>
            <span className="player-score">{player.score || 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PlayerList;
