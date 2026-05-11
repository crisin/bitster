export interface StreamingDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
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
  getPlaylistTracks(playlistId: string): Promise<Track[]>;
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
}
