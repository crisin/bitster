import type { SongShape } from "@/schema/song";

export interface StreamingDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

/** The account actually connected — key evidence when auth "works" but playback doesn't */
export interface StreamingAccount {
  id: string;
  name: string;
  email: string | null;
  /** e.g. Spotify: "premium" | "free" | "open" */
  product: string | null;
  country: string | null;
}

export interface DiagnosticCheck {
  key: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface StreamingDiagnostics {
  /** Load the connected account's profile (also stores it in the streaming store) */
  loadAccount(): Promise<StreamingAccount | null>;
  /** Run all connection checks — never throws, failures become "fail" entries */
  run(): Promise<DiagnosticCheck[]>;
}

export interface PlaylistMeta {
  id: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
}

/**
 * The request failed — as opposed to the track simply being unusable. The
 * caller must NOT treat this as "this slot is empty", or a rate limit would
 * eat playlist entries and eventually look like an exhausted playlist.
 */
export class StreamingFetchError extends Error {
  constructor(
    message: string,
    /** Worth retrying: rate limit or a server-side hiccup */
    readonly transient: boolean,
    readonly status: number,
  ) {
    super(message);
    this.name = "StreamingFetchError";
  }
}

export interface RandomPoolOptions {
  /** How many songs to collect */
  target: number;
  /** Called after every page so the lobby can show progress */
  onProgress?: (collected: number, target: number) => void;
  signal?: AbortSignal;
}

/** Result of the cheap one-page availability check run in the lobby */
export interface PlaylistProbe {
  /** Entries looked at (the first page, so at most 50) */
  checked: number;
  /** How many of them the app could actually turn into a playable track */
  usable: number;
  /**
   * True when the provider never sent an availability flag, so the filter is
   * running blind. Not an error — but the number above then only reflects
   * metadata problems, not regional or account restrictions.
   */
  availabilityUnknown: boolean;
}

/**
 * Provider-agnostic track — field-identical to the game's Song by
 * construction, because both derive from src/schema/song.ts.
 */
export interface Track extends SongShape {}

export interface StreamingAuth {
  login(): Promise<void>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;
  refreshToken(): Promise<void>;
}

export interface StreamingPlayer {
  play(trackUri: string): Promise<void>;
  pause(): Promise<void>;
  getDevices(): Promise<StreamingDevice[]>;
  setDevice(deviceId: string): Promise<void>;
}

export interface StreamingLibrary {
  getTrackAtIndex(playlistId: string, index: number): Promise<Track | null>;
  parsePlaylistUrl(url: string): string | null;
  getPlaylistMeta(playlistId: string): Promise<PlaylistMeta>;
  /** Canonical share link for a playlist — the inverse of parsePlaylistUrl */
  buildPlaylistUrl(playlistId: string): string;
  /**
   * Optional: one cheap request that reports how much of a playlist is
   * actually usable. Deliberately only the first page — a full scan would cost
   * a request per 50 tracks at the worst possible moment (the lobby, right
   * before the start) and still only answer for this one account.
   */
  probePlaylist?(playlistId: string): Promise<PlaylistProbe | null>;
  /**
   * Optional: a pool of random playable tracks from the signed-in user's OWN
   * library, for a game without a pasted playlist link. Resolved up front
   * rather than lazily, because there is no stable index space across a set of
   * playlists that can change under you.
   */
  buildRandomPool?(opts: RandomPoolOptions): Promise<Track[]>;
}

export interface StreamingProvider {
  id: string;
  name: string;
  color: string;
  icon: string;
  auth: StreamingAuth;
  player: StreamingPlayer;
  library: StreamingLibrary;
  /** Optional connection troubleshooting (account info, health checks) */
  diagnostics?: StreamingDiagnostics;
}
