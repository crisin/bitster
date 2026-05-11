import type { StreamingProvider } from "@/streaming/types";
import { registerProvider } from "@/streaming/registry";
import { spotifyAuth, restoreSession } from "./auth";
import { spotifyPlayer } from "./player";
import { spotifyLibrary } from "./playlist";

export const spotifyProvider: StreamingProvider = {
  id: "spotify",
  name: "Spotify",
  color: "#1DB954",
  icon: "spotify",
  auth: spotifyAuth,
  player: spotifyPlayer,
  library: spotifyLibrary,
};

export function initSpotify(): void {
  registerProvider(spotifyProvider);
  restoreSession();
}

export { restoreSession };
