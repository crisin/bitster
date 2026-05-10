import { createContext, useContext, useEffect, useReducer, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);

const initialState = {
  roomCode: null,
  players: [],
  currentPlayerId: null,
  currentSongUri: null,
  phase: 'lobby',
  lastResult: null,
  hostId: null,
  timelines: {},
  status: 'waiting',
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'ROOM_JOINED':
      return {
        ...state,
        roomCode: action.payload.roomCode,
        hostId: action.payload.hostId,
        players: action.payload.players || state.players,
      };
    case 'ROOM_STATE':
      return {
        ...state,
        players: action.payload.players,
        hostId: action.payload.hostId,
        status: action.payload.status,
        phase: action.payload.status === 'waiting' ? 'lobby' : state.phase,
      };
    case 'GAME_STATE':
      return {
        ...state,
        phase: action.payload.phase,
        status: action.payload.status,
        players: action.payload.players,
        currentPlayerId: action.payload.currentPlayerId,
        currentSongUri: action.payload.currentSongUri,
        lastResult: action.payload.lastResult,
        timelines: action.payload.timelines,
        hostId: action.payload.hostId,
      };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('playerName') || '');
  const socketRef = useRef(null);

  const getSocket = useCallback(() => socketRef.current, []);

  function connectSocket() {
    if (socketRef.current?.connected) return socketRef.current;

    const serverUrl = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
    const socket = io(serverUrl, { transports: ['websocket'] });

    socket.on('room-state', (data) => dispatch({ type: 'ROOM_STATE', payload: data }));
    socket.on('game-state', (data) => dispatch({ type: 'GAME_STATE', payload: data }));

    socketRef.current = socket;
    return socket;
  }

  function createRoom(name, cb) {
    const socket = connectSocket();
    setPlayerName(name);
    localStorage.setItem('playerName', name);

    socket.emit('create-room', { playerName: name }, (response) => {
      if (response.success) {
        dispatch({
          type: 'ROOM_JOINED',
          payload: { roomCode: response.roomCode, hostId: socket.id, players: response.room?.players },
        });
      }
      if (cb) cb(response);
    });
  }

  function joinRoom(roomCode, name, cb) {
    const socket = connectSocket();
    setPlayerName(name);
    localStorage.setItem('playerName', name);

    socket.emit('join-room', { roomCode, playerName: name }, (response) => {
      if (response.success) {
        dispatch({
          type: 'ROOM_JOINED',
          payload: { roomCode, hostId: response.room?.hostId, players: response.room?.players },
        });
      }
      if (cb) cb(response);
    });
  }

  function emit(event, data, cb) {
    if (socketRef.current) {
      socketRef.current.emit(event, data, cb);
    }
  }

  function disconnect() {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    dispatch({ type: 'RESET' });
  }

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  return (
    <GameContext.Provider value={{ ...state, playerName, getSocket, createRoom, joinRoom, emit, disconnect }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
}
