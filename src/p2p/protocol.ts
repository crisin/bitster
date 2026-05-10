import type { GameState, GameSettings } from "@/game/types";

export type P2PAction =
  | { type: "join"; payload: { name: string } }
  | { type: "player-joined"; payload: { id: string; name: string } }
  | { type: "player-left"; payload: { id: string } }
  | { type: "game-state"; payload: GameState }
  | { type: "start-game"; payload: { playlistUrl: string } }
  | { type: "place-song"; payload: { position: number } }
  | { type: "hitster-buzz"; payload: { position: number } }
  | { type: "next-round" }
  | { type: "play-song"; payload: { uri: string } }
  | { type: "pause-song" }
  | { type: "kick-player"; payload: { playerId: string } }
  | { type: "update-settings"; payload: Partial<GameSettings> }
  | { type: "rematch" }
  | { type: "error"; payload: { message: string } };

export type P2PActionType = P2PAction["type"];
