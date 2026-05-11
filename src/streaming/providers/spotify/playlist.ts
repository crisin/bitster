import type { StreamingLibrary, Track, PlaylistMeta } from "@/streaming/types";
import { fetchWithAuth } from "./auth";
import { log } from "@/utils/logger";

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
  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    const tracks: Track[] = [];
    let url: string | null =
      `${API}/playlists/${playlistId}/tracks?fields=items(track(id,uri,name,artists(name),album(release_date,images))),next&limit=100`;

    while (url) {
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error(`Fetch playlist failed: ${res.status}`);

      const data = await res.json();

      for (const item of data.items as SpotifyTrack[]) {
        if (!item.track || !item.track.id) continue;

        const year = extractYear(item.track.album.release_date);
        if (isNaN(year)) continue;

        // Pick smallest image (64px thumbnail) for timeline cards
        const images = item.track.album.images;
        const imageUrl = images?.length
          ? (images.reduce((smallest, img) =>
              (img.height ?? Infinity) < (smallest.height ?? Infinity) ? img : smallest
            )).url
          : undefined;

        tracks.push({
          id: item.track.id,
          uri: item.track.uri,
          name: item.track.name,
          artist: item.track.artists.map((a) => a.name).join(", "),
          year,
          imageUrl,
        });
      }

      url = data.next ?? null;
    }

    log.info("spotify", `Loaded ${tracks.length} tracks from playlist ${playlistId}`);
    return tracks;
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
