import {
  buildSong,
  SONG_FIELD_ENTRIES,
  type SongFieldName,
  type SongShape,
} from "@/schema/song";
import type { Track } from "@/streaming/types";

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

// Feb 2026 Web API migration: /playlists/{id}/tracks became /playlists/{id}/items,
// each entry wraps the track as `item` (was `track`) and carries `is_local` itself.
// The old endpoint answers with a bare 403 since March 9, 2026.
export interface SpotifyPlaylistItem {
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
    artists?: { name: string }[];
    /** Absent on episodes — a playlist can legitimately contain podcasts */
    album?: {
      name?: string;
      release_date?: string;
      images?: SpotifyImage[];
    };
    /** Why the track can't be played: "market" | "product" | "explicit" */
    restrictions?: { reason?: string };
  } | null;
}

type SpotifyTrack = NonNullable<SpotifyPlaylistItem["item"]>;

/** NaN for a malformed or missing date — the schema then rejects the track */
function extractYear(releaseDate: string | undefined): number {
  return parseInt((releaseDate ?? "").substring(0, 4), 10);
}

/**
 * How often Spotify actually delivered the fields we filter on. Both are
 * OPTIONAL in the payload, so a missing field silently disables its filter —
 * counting is the only way to find out whether the filters do anything at all.
 *
 * `is_playable` only arrives when a market was resolved for the request, and
 * `popularity` was removed from the track object for development-mode apps in
 * the February 2026 migration (which would mean the Deep Cut / Banger badges
 * never render any more). Both are questions the docs do not settle — one game
 * night with these counters does.
 */
export interface FieldPresence {
  tracksSeen: number;
  withIsPlayable: number;
  withPopularity: number;
  rejectedUnplayable: number;
  rejectedRestricted: number;
}

const presence: FieldPresence = {
  tracksSeen: 0,
  withIsPlayable: 0,
  withPopularity: 0,
  rejectedUnplayable: 0,
  rejectedRestricted: 0,
};

export function getFieldPresence(): FieldPresence {
  return { ...presence };
}

export function resetFieldPresence(): void {
  presence.tracksSeen = 0;
  presence.withIsPlayable = 0;
  presence.withPopularity = 0;
  presence.rejectedUnplayable = 0;
  presence.rejectedRestricted = 0;
}

/** Smallest artwork that exists — these end up on little timeline cards */
function smallestImage(images: SpotifyImage[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  return images.reduce((smallest, image) =>
    (image.height ?? Infinity) < (smallest.height ?? Infinity) ? image : smallest,
  ).url;
}

/**
 * Where every Song field comes from in Spotify's payload. Keyed by
 * SongFieldName, so adding a field to the schema is a COMPILE ERROR here until
 * the provider says where it is read from — the one spot that genuinely needs a
 * human decision.
 */
type SpotifySource = {
  readonly [K in SongFieldName]: {
    /** Dotted paths inside the item object, for the `fields` query param */
    readonly paths: readonly string[];
    readonly read: (track: SpotifyTrack) => SongShape[K] | undefined;
  };
};

const SPOTIFY_SOURCE: SpotifySource = {
  id: { paths: ["id"], read: (t) => t.id },
  uri: { paths: ["uri"], read: (t) => t.uri },
  name: { paths: ["name"], read: (t) => t.name },
  artist: {
    paths: ["artists.name"],
    read: (t) => (t.artists ?? []).map((a) => a.name).join(", "),
  },
  year: {
    paths: ["album.release_date"],
    read: (t) => extractYear(t.album?.release_date),
  },
  imageUrl: {
    paths: ["album.images"],
    read: (t) => smallestImage(t.album?.images),
  },
  durationMs: { paths: ["duration_ms"], read: (t) => t.duration_ms },
  explicit: { paths: ["explicit"], read: (t) => t.explicit },
  popularity: { paths: ["popularity"], read: (t) => t.popularity },
  albumName: { paths: ["album.name"], read: (t) => t.album?.name || undefined },
};

/** Leaves we need for filtering, not for the Song itself */
const FILTER_PATHS = ["is_playable", "is_local", "restrictions.reason"] as const;

/** Exposed so a test can assert every schema field is actually requested */
export const SPOTIFY_SOURCE_PATHS: Record<SongFieldName, readonly string[]> =
  Object.fromEntries(
    SONG_FIELD_ENTRIES.map(([name]) => [name, SPOTIFY_SOURCE[name].paths]),
  ) as Record<SongFieldName, readonly string[]>;

interface PathNode {
  children: Map<string, PathNode>;
}

/** Turn dotted paths into Spotify's `a,b(c,d)` fields syntax */
function toFieldsExpression(paths: readonly string[]): string {
  const root: PathNode = { children: new Map() };
  for (const path of paths) {
    let node = root;
    for (const part of path.split(".")) {
      let next = node.children.get(part);
      if (!next) {
        next = { children: new Map() };
        node.children.set(part, next);
      }
      node = next;
    }
  }
  const render = (node: PathNode): string =>
    [...node.children.entries()]
      .map(([name, child]) =>
        child.children.size === 0 ? name : `${name}(${render(child)})`,
      )
      .join(",");
  return render(root);
}

/**
 * The `fields` param for /playlists/{id}/items. Derived, so a new schema field
 * is requested from the API automatically instead of arriving as undefined.
 */
export const PLAYLIST_ITEMS_FIELDS = `items(is_local,item(${toFieldsExpression([
  ...SONG_FIELD_ENTRIES.flatMap(([name]) => SPOTIFY_SOURCE[name].paths),
  ...FILTER_PATHS,
])}))`;

/**
 * Map one playlist entry to a Track. Returns null for local files, tracks the
 * account cannot play, and anything missing a required field (a malformed
 * release date, for instance) — those would only stall a round.
 */
export function trackFromItem(entry: SpotifyPlaylistItem): Track | null {
  const track = entry.item;
  if (!track || !track.id) return null;
  if (entry.is_local === true || track.is_local === true) return null;

  presence.tracksSeen++;
  if (track.is_playable !== undefined) presence.withIsPlayable++;
  if (track.popularity !== undefined) presence.withPopularity++;

  // Deliberately `=== false`, not `!== true`: when Spotify omits the field the
  // filter must stay open. Fail-closed would reject every track and end every
  // game instantly — the counters above are how we learn which case we are in.
  if (track.is_playable === false) {
    presence.rejectedUnplayable++;
    return null;
  }
  // "market" | "product" | "explicit" — any reason means it won't play here
  if (track.restrictions?.reason) {
    presence.rejectedRestricted++;
    return null;
  }
  // Episodes have no album, so the year comes back NaN and buildSong rejects
  // them — a playlist may legitimately contain podcasts.
  return buildSong((name) => SPOTIFY_SOURCE[name].read(track));
}
