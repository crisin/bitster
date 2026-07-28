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
    duration_ms?: number;
    explicit?: boolean;
    popularity?: number;
    artists: { name: string }[];
    album: {
      name?: string;
      release_date: string;
      images?: SpotifyImage[];
    };
  } | null;
}

function extractYear(releaseDate: string): number {
  return parseInt(releaseDate.substring(0, 4), 10);
}

/** Look a playlist up in the user's own library (first 50 — cosmetic only) */
async function findOwnPlaylist(
  playlistId: string,
): Promise<{ name: string; imageUrl: string | null } | null> {
  try {
    const res = await fetchWithAuth(`${API}/me/playlists?limit=50`);
    if (!res.ok) return null;
    const data = await res.json();
    const items = (data.items ?? []) as {
      id?: string;
      name?: string;
      images?: SpotifyImage[];
    }[];
    const match = items.find((p) => p.id === playlistId);
    if (!match?.name) return null;
    return { name: match.name, imageUrl: match.images?.[0]?.url ?? null };
  } catch {
    return null;
  }
}

export const spotifyLibrary: StreamingLibrary = {
  async getTrackAtIndex(playlistId: string, index: number): Promise<Track | null> {
    // market=from_token relinks region-locked tracks and fills is_playable —
    // without it Spotify happily returns tracks the account cannot play
    // ("Spotify can't play this file"), which then stall the round.
    // duration/explicit/popularity/album name are free — same request, and
    // they fuel the reveal badges (Deep Cut / Banger, 🅴) and end-game stats
    const fields =
      "items(is_local,item(id,uri,name,is_playable,is_local,duration_ms,explicit,popularity,artists(name),album(name,release_date,images)))";
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
      durationMs: typeof t.duration_ms === "number" ? t.duration_ms : undefined,
      explicit: typeof t.explicit === "boolean" ? t.explicit : undefined,
      popularity: typeof t.popularity === "number" ? t.popularity : undefined,
      albumName: t.album.name || undefined,
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
    let name: string | null = null;
    let imageUrl: string | null = null;
    let total: number | null = null;

    const res = await fetchWithAuth(
      `${API}/playlists/${playlistId}?fields=id,name,items.total,images`,
    );
    if (res.ok) {
      const data = await res.json();
      name = data.name ?? null;
      imageUrl = data.images?.[0]?.url ?? null;
      total = data.items?.total ?? null;
    }

    if (total == null) {
      // The metadata endpoint answers with a bare 403 for some dev-mode apps
      // since the Feb 2026 changes. The items endpoint is what the game needs
      // anyway — if it works, the playlist is playable, so probe it directly.
      const itemsRes = await fetchWithAuth(
        `${API}/playlists/${playlistId}/items?limit=1&fields=total`,
      );
      if (!itemsRes.ok) {
        throw new Error(
          `Fetch playlist meta failed: ${res.status}` +
            (itemsRes.status !== res.status ? `/${itemsRes.status}` : ""),
        );
      }
      const itemsData = await itemsRes.json();
      total = typeof itemsData.total === "number" ? itemsData.total : 0;
    }

    if (name == null) {
      // Name/cover are cosmetic — try to find them among the user's own
      // playlists, and fall back to a generic label if that fails too.
      const own = await findOwnPlaylist(playlistId);
      name = own?.name ?? null;
      imageUrl = imageUrl ?? own?.imageUrl ?? null;
    }

    return {
      id: playlistId,
      name: name ?? "Playlist",
      trackCount: total ?? 0,
      imageUrl,
    };
  },
};
