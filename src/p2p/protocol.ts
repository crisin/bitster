import type { GameState, GameSettings } from "@/game/types";

export type P2PAction =
  | { type: "join"; payload: { name: string } }
  | { type: "player-joined"; payload: { id: string; name: string } }
  | { type: "player-left"; payload: { id: string } }
  | { type: "game-state"; payload: GameState }
  | { type: "start-game"; payload: { playlistUrl: string } }
  | { type: "place-song"; payload: { position: number } }
  | { type: "hitster-buzz" }
  | { type: "buzz-place"; payload: { position: number } }
  | { type: "next-round" }
  | { type: "play-song"; payload: { uri: string } }
  | { type: "pause-song" }
  | { type: "kick-player"; payload: { playerId: string } }
  | { type: "update-settings"; payload: Partial<GameSettings> }
  | { type: "rematch" }
  | { type: "error"; payload: { message: string } };

export type P2PActionType = P2PAction["type"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isNonNegativeInt(v: unknown): v is number {
  return isFiniteInt(v) && v >= 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length < 1000;
}

export function validateAction(data: unknown): P2PAction | null {
  if (!isObject(data) || typeof data.type !== "string") return null;

  const p = data.payload;

  switch (data.type) {
    case "join":
      if (!isObject(p) || !isNonEmptyString(p.name)) return null;
      return { type: "join", payload: { name: p.name } };

    case "player-joined":
      if (!isObject(p) || !isNonEmptyString(p.id) || !isNonEmptyString(p.name))
        return null;
      return { type: "player-joined", payload: { id: p.id, name: p.name } };

    case "player-left":
      if (!isObject(p) || !isNonEmptyString(p.id)) return null;
      return { type: "player-left", payload: { id: p.id } };

    case "game-state":
      if (!isObject(p) || typeof p.roomCode !== "string" || typeof p.phase !== "string") return null;
      return { type: "game-state", payload: p as unknown as GameState };

    case "start-game":
      if (!isObject(p) || typeof p.playlistUrl !== "string") return null;
      return { type: "start-game", payload: { playlistUrl: p.playlistUrl } };

    case "place-song":
      if (!isObject(p) || !isNonNegativeInt(p.position)) return null;
      return { type: "place-song", payload: { position: p.position } };

    case "hitster-buzz":
      return { type: "hitster-buzz" };

    case "buzz-place":
      if (!isObject(p) || !isNonNegativeInt(p.position)) return null;
      return { type: "buzz-place", payload: { position: p.position } };

    case "next-round":
      return { type: "next-round" };

    case "play-song":
      if (!isObject(p) || !isNonEmptyString(p.uri)) return null;
      return { type: "play-song", payload: { uri: p.uri } };

    case "pause-song":
      return { type: "pause-song" };

    case "kick-player":
      if (!isObject(p) || !isNonEmptyString(p.playerId)) return null;
      return { type: "kick-player", payload: { playerId: p.playerId } };

    case "update-settings":
      if (!isObject(p)) return null;
      return { type: "update-settings", payload: p as Partial<GameSettings> };

    case "rematch":
      return { type: "rematch" };

    case "error":
      if (!isObject(p) || typeof p.message !== "string") return null;
      return { type: "error", payload: { message: p.message } };

    default:
      return null;
  }
}
