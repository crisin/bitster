import type { StreamingLibrary, Track, PlaylistMeta } from "@/streaming/types";
import { fetchWithAuth } from "./auth";

const API = "https://api.spotify.com/v1";

interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

// Feb 2026 Web API migration: /playlists/{id}/tracks became /playlists/{id}/items,
// each entry wraps the track as `item` (was `track`) and carries `is_local` itself.
// The old endpoint answers with a bare 403 since March 9, 2026.
interface SpotifyPlaylistItem {
  is_local?: boolean;
  item: {
    id: string;
    uri: string;
    name: string;
    is_playable?: boolean;
    is_local?: boolean;
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
    // market=from_token relinks region-locked tracks and fills is_playable —
    // without it Spotify happily returns tracks the account cannot play
    // ("Spotify can't play this file"), which then stall the round.
    const fields =
      "items(is_local,item(id,uri,name,is_playable,is_local,artists(name),album(release_date,images)))";
    const res = await fetchWithAuth(
      `${API}/playlists/${playlistId}/items?fields=${fields}&market=from_token&offset=${index}&limit=1`,
    );
    if (!res.ok) throw new Error(`Fetch track at index ${index} failed: ${res.status}`);

    const data = await res.json();
    const items = data.items as SpotifyPlaylistItem[];
    if (items.length === 0 || !items[0].item || !items[0].item.id) return null;

    const t = items[0].item;
    if (items[0].is_local === true || t.is_local === true || t.is_playable === false)
      return null;
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
    // Feb 2026 migration: the playlist's `tracks` field is now `items`, and it
    // is only present for playlists the user owns or collaborates on. Foreign
    // playlists return metadata without `items` — report 0 tracks, which the
    // callers already treat as "unusable" (their items can't be fetched anyway).
    const res = await fetchWithAuth(
      `${API}/playlists/${playlistId}?fields=id,name,items.total,images`,
    );
    if (!res.ok) throw new Error(`Fetch playlist meta failed: ${res.status}`);

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      trackCount: data.items?.total ?? 0,
      imageUrl: data.images?.[0]?.url ?? null,
    };
  },
};
