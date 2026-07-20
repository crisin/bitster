import type { StreamingLibrary, Track, PlaylistMeta } from "@/streaming/types";
import { fetchWithAuth } from "./auth";

const API = "https://api.spotify.com/v1";

interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

interface SpotifyTrack {
  track: {
    id: string;
    uri: string;
    name: string;
    artists: { name: string }[];
    album: {
      release_date: string;
      images?: SpotifyImage[];
    };
  } | null;
}

function extractYear(releaseDate: string): number {
  return parseInt(releaseDate.substring(0, 4), 10);
}

export const spotifyLibrary: StreamingLibrary = {
  async getTrackAtIndex(playlistId: string, index: number): Promise<Track | null> {
    const res = await fetchWithAuth(
      `${API}/playlists/${playlistId}/tracks?fields=items(track(id,uri,name,artists(name),album(release_date,images)))&offset=${index}&limit=1`,
    );
    if (!res.ok) throw new Error(`Fetch track at index ${index} failed: ${res.status}`);

    const data = await res.json();
    const items = data.items as SpotifyTrack[];
    if (items.length === 0 || !items[0].track || !items[0].track.id) return null;

    const t = items[0].track;
    const year = extractYear(t.album.release_date);
    if (isNaN(year)) return null;

    const images = t.album.images;
    const imageUrl = images?.length
      ? images.reduce((s, i) =>
          (i.height ?? Infinity) < (s.height ?? Infinity) ? i : s
        ).url
      : undefined;

    return {
      id: t.id,
      uri: t.uri,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      year,
      imageUrl,
    };
  },

  parsePlaylistUrl(url: string): string | null {
    // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
    const match = url.match(
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    );
    if (match) return match[1];

    // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
    const uriMatch = url.match(/spotify:playlist:([a-zA-Z0-9]+)/);
    if (uriMatch) return uriMatch[1];

    // Raw playlist ID
    if (/^[a-zA-Z0-9]{22}$/.test(url.trim())) return url.trim();

    return null;
  },

  async getPlaylistMeta(playlistId: string): Promise<PlaylistMeta> {
    const res = await fetchWithAuth(
      `${API}/playlists/${playlistId}?fields=id,name,tracks.total,images`,
    );
    if (!res.ok) throw new Error(`Fetch playlist meta failed: ${res.status}`);

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      trackCount: data.tracks.total,
      imageUrl: data.images?.[0]?.url ?? null,
    };
  },
};
