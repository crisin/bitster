import type { RandomPoolOptions, Track } from "@/streaming/types";
import { StreamingFetchError } from "@/streaming/types";
import { log } from "@/utils/logger";
import { fetchWithAuth } from "./auth";
import type { SpotifyPlaylistItem } from "./songMapping";
import { PLAYLIST_ITEMS_FIELDS, trackFromItem } from "./songMapping";

const API = "https://api.spotify.com/v1";

/** Spotify's hard maximum for a single page of playlist items */
const PAGE_SIZE = 50;
/** Playlists this short aren't worth a request */
const MIN_PLAYLIST_SIZE = 5;
/** Stop after this many requests no matter what — the lobby must not hang */
const MAX_REQUESTS = 14;
/** Give up when this many pages in a row yield nothing new */
const MAX_EMPTY_PAGES = 3;

/**
 * No single playlist may dominate the game — a 5000-track dump would otherwise
 * win every draw and turn "random from my library" into "that one playlist".
 */
const PLAYLIST_WEIGHT_CAP = 400;
/** At most this share of the pool from one playlist */
const PLAYLIST_SHARE = 0.25;
/** The game is ABOUT years, so one decade must not swallow the pool */
const DECADE_SHARE = 0.35;
/** Two songs by the same act is plenty */
const MAX_PER_ARTIST = 2;

interface OwnPlaylist {
  id: string;
  name: string;
  size: number;
}

interface RawPlaylist {
  id?: string;
  name?: string;
  collaborative?: boolean;
  owner?: { id?: string };
  items?: { total?: number };
  tracks?: { total?: number };
}

/** First name before the comma — "Eminem, Rihanna" and "Eminem" are one act */
function primaryArtist(artist: string): string {
  return artist.split(",")[0]!.trim().toLowerCase();
}

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/**
 * Which playlists this account can actually read. Since the February 2026
 * changes, playlist CONTENTS come back only for playlists the user owns or
 * collaborates on — followed and editorial ones are listed but unreadable, so
 * they must be filtered out or every draw would hit a dead end.
 */
async function listOwnPlaylists(signal?: AbortSignal): Promise<OwnPlaylist[]> {
  let ownerId: string | null = null;
  try {
    const me = await fetchWithAuth(`${API}/me`);
    if (me.ok) ownerId = ((await me.json()) as { id?: string }).id ?? null;
  } catch {
    // /me can answer with a bare 403 in development mode — carry on without it
  }

  const out: OwnPlaylist[] = [];
  for (let page = 0; page < 2; page++) {
    if (signal?.aborted) break;
    const res = await fetchWithAuth(
      `${API}/me/playlists?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    );
    if (!res.ok) {
      throw new StreamingFetchError(
        `Could not list playlists: ${res.status}`,
        res.status === 429 || res.status >= 500,
        res.status,
      );
    }
    const data = (await res.json()) as { items?: RawPlaylist[] };
    const items = data.items ?? [];
    for (const item of items) {
      if (!item.id || !item.name) continue;
      // Without a known owner id, collaborative is the only signal left; keep
      // everything and let the unreadable ones fail their page fetch harmlessly.
      const mine =
        ownerId === null ||
        item.collaborative === true ||
        item.owner?.id === ownerId;
      if (!mine) continue;
      const size = item.items?.total ?? item.tracks?.total ?? 0;
      if (size < MIN_PLAYLIST_SIZE) continue;
      out.push({ id: item.id, name: item.name, size });
    }
    if (items.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * Pick a playlist with probability proportional to its size, so every TRACK in
 * the library is equally likely — which is what "a random song from my music"
 * actually means. The cap keeps one huge playlist from being the whole game.
 */
function drawPlaylist(playlists: OwnPlaylist[]): OwnPlaylist | null {
  const weights = playlists.map((p) => Math.min(p.size, PLAYLIST_WEIGHT_CAP));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;
  let ticket = Math.random() * total;
  for (let i = 0; i < playlists.length; i++) {
    ticket -= weights[i]!;
    if (ticket <= 0) return playlists[i]!;
  }
  return playlists[playlists.length - 1] ?? null;
}

/**
 * Enforce the "keep it fun" limits. Pure and exported so the rules can be
 * tested without touching the network.
 */
export function applySamplingCaps(
  candidates: Track[],
  target: number,
): Track[] {
  const perArtist = new Map<string, number>();
  const perDecade = new Map<number, number>();
  const seen = new Set<string>();
  const decadeCap = Math.max(1, Math.ceil(target * DECADE_SHARE));
  const out: Track[] = [];

  for (const track of candidates) {
    if (out.length >= target) break;
    if (seen.has(track.id)) continue;
    // Spotify junk release dates, and years that were never revealed
    if (track.year < 1900) continue;

    const artist = primaryArtist(track.artist);
    if ((perArtist.get(artist) ?? 0) >= MAX_PER_ARTIST) continue;
    const decade = decadeOf(track.year);
    if ((perDecade.get(decade) ?? 0) >= decadeCap) continue;

    seen.add(track.id);
    perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
    perDecade.set(decade, (perDecade.get(decade) ?? 0) + 1);
    out.push(track);
  }
  return out;
}

/** Fisher-Yates, so the pool isn't ordered by the playlist it came from */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Collect a pool of playable tracks from the user's own playlists.
 *
 * Deliberately host-only: in development mode Spotify returns playlist
 * contents solely for the requesting account, so there is no way to reach a
 * fellow player's music — and letting peers contribute songs would hand them
 * the answers before the round even starts.
 */
export async function buildRandomPool(
  opts: RandomPoolOptions,
): Promise<Track[]> {
  const target = Math.max(1, Math.floor(opts.target));
  const playlists = await listOwnPlaylists(opts.signal);
  if (playlists.length === 0) return [];

  const perPlaylistCap = Math.max(1, Math.ceil(target * PLAYLIST_SHARE));
  const takenFrom = new Map<string, number>();
  const candidates: Track[] = [];
  let requests = 0;
  let emptyPages = 0;

  while (
    requests < MAX_REQUESTS &&
    emptyPages < MAX_EMPTY_PAGES &&
    !opts.signal?.aborted
  ) {
    // Over-collect: the caps below throw a lot away, so stopping at exactly
    // `target` candidates would reliably produce a short pool.
    const enough = applySamplingCaps(shuffle(candidates), target);
    if (enough.length >= target) break;

    const eligible = playlists.filter(
      (p) => (takenFrom.get(p.id) ?? 0) < perPlaylistCap,
    );
    if (eligible.length === 0) break;

    const playlist = drawPlaylist(eligible);
    if (!playlist) break;

    const maxOffset = Math.max(0, playlist.size - PAGE_SIZE);
    const offset = Math.floor(Math.random() * (maxOffset + 1));
    requests++;

    let found = 0;
    try {
      const res = await fetchWithAuth(
        `${API}/playlists/${playlist.id}/items?fields=${PLAYLIST_ITEMS_FIELDS}` +
          `&market=from_token&offset=${offset}&limit=${PAGE_SIZE}`,
      );
      if (!res.ok) {
        // An unreadable playlist (not actually ours) must not stop the run
        log.warn(
          "spotify",
          `Random pool: skipping "${playlist.name}" (${res.status})`,
        );
        playlists.splice(playlists.indexOf(playlist), 1);
        if (playlists.length === 0) break;
        continue;
      }
      const data = (await res.json()) as { items?: SpotifyPlaylistItem[] };
      for (const item of data.items ?? []) {
        const track = trackFromItem(item);
        if (track) {
          candidates.push(track);
          found++;
        }
      }
    } catch (err) {
      log.warn("spotify", `Random pool page failed: ${err}`);
    }

    takenFrom.set(playlist.id, (takenFrom.get(playlist.id) ?? 0) + found);
    emptyPages = found === 0 ? emptyPages + 1 : 0;
    opts.onProgress?.(
      Math.min(target, applySamplingCaps(candidates, target).length),
      target,
    );
  }

  const pool = applySamplingCaps(shuffle(candidates), target);
  log.info(
    "spotify",
    `Random pool: ${pool.length} songs from ${playlists.length} playlists (${requests} requests)`,
  );
  return pool;
}
