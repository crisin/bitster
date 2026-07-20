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

export interface Track {
  id: string;
  uri: string;
  name: string;
  artist: string;
  year: number;
  imageUrl?: string;
}

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
