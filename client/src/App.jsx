import { Routes, Route } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import Home from './pages/Home';
import Game from './pages/Game';
import Callback from './pages/Callback';
import './App.css';

function App() {
  return (
    <GameProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:roomCode" element={<Game />} />
          <Route path="/auth/success" element={<Callback />} />
        </Routes>
      </div>
    </GameProvider>
  );
}

export default App;
