import type {
  StreamingLibrary,
  Track,
  PlaylistMeta,
  PlaylistProbe,
} from "@/streaming/types";
import { StreamingFetchError } from "@/streaming/types";
import { fetchWithAuth } from "./auth";
import { buildRandomPool } from "./randomPool";
import type { SpotifyImage, SpotifyPlaylistItem } from "./songMapping";
import {
  getFieldPresence,
  PLAYLIST_ITEMS_FIELDS,
  trackFromItem,
} from "./songMapping";

const API = "https://api.spotify.com/v1";

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
  buildRandomPool,

  async getTrackAtIndex(playlistId: string, index: number): Promise<Track | null> {
    // `market` decides whether Spotify relinks region-locked tracks and whether
    // it fills is_playable at all. `from_token` still appears on Spotify's
    // track-relinking page but is no longer listed as an accepted value on this
    // endpoint's reference — and with a user token the account's country is
    // applied anyway. Whether the flag actually arrives is measured rather than
    // assumed: see getFieldPresence() in songMapping.ts.
    const res = await fetchWithAuth(
      `${API}/playlists/${playlistId}/items?fields=${PLAYLIST_ITEMS_FIELDS}&market=from_token&offset=${index}&limit=1`,
    );
    if (!res.ok) {
      // A failed REQUEST is not an empty slot. Telling the two apart is what
      // keeps a rate limit from eating playlist entries until the game thinks
      // the playlist ran out.
      throw new StreamingFetchError(
        `Fetch track at index ${index} failed: ${res.status}`,
        res.status === 429 || res.status >= 500,
        res.status,
      );
    }

    const data = await res.json();
    const items = data.items as SpotifyPlaylistItem[];
    if (items.length === 0) return null;
    return trackFromItem(items[0]);
  },

  async probePlaylist(playlistId: string): Promise<PlaylistProbe | null> {
    const before = getFieldPresence();
    const res = await fetchWithAuth(
      `${API}/playlists/${playlistId}/items?fields=${PLAYLIST_ITEMS_FIELDS}&market=from_token&offset=0&limit=50`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const items = (data.items ?? []) as SpotifyPlaylistItem[];
    let usable = 0;
    for (const item of items) {
      if (trackFromItem(item)) usable++;
    }

    const after = getFieldPresence();
    const inspected = after.tracksSeen - before.tracksSeen;
    return {
      checked: items.length,
      usable,
      // Not one of the tracks carried an availability flag → the filter is blind
      availabilityUnknown:
        inspected > 0 && after.withIsPlayable === before.withIsPlayable,
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

  buildPlaylistUrl(playlistId: string): string {
    // Canonical form on purpose — the pasted link often carries ?si= tracking
    return `https://open.spotify.com/playlist/${playlistId}`;
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
