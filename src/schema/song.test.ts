import {
  getFieldPresence,
  PLAYLIST_ITEMS_FIELDS,
  resetFieldPresence,
  SPOTIFY_SOURCE_PATHS,
  trackFromItem,
  type SpotifyPlaylistItem,
} from "@/streaming/providers/spotify/songMapping";
import { describe, expect, it } from "vitest";
import type { SongShape } from "./song";
import { buildSong, maskSecrets, SONG_FIELD_ENTRIES } from "./song";

const FULL: SongShape = {
  id: "track-1",
  uri: "spotify:track:1",
  name: "Song",
  artist: "Artist",
  year: 1975,
  imageUrl: "https://example.test/cover.jpg",
  durationMs: 210_000,
  explicit: true,
  popularity: 42,
  albumName: "Album",
};

function spotifyItem(): SpotifyPlaylistItem {
  return {
    is_local: false,
    item: {
      id: "track-1",
      uri: "spotify:track:1",
      name: "Song",
      is_playable: true,
      is_local: false,
      duration_ms: 210_000,
      explicit: true,
      popularity: 42,
      artists: [{ name: "Artist" }, { name: "Guest" }],
      album: {
        name: "Album",
        release_date: "1975-10-31",
        images: [
          { url: "big.jpg", height: 640, width: 640 },
          { url: "small.jpg", height: 64, width: 64 },
        ],
      },
    },
  };
}

describe("song schema — the four places cannot drift apart", () => {
  it("requests every field from Spotify that the schema declares", () => {
    // The guard: a field added to SONG_FIELDS but never asked for would arrive
    // as undefined on every single track.
    for (const [name] of SONG_FIELD_ENTRIES) {
      const paths = SPOTIFY_SOURCE_PATHS[name];
      expect(paths.length, `${name} declares no source path`).toBeGreaterThan(0);
      for (const path of paths) {
        for (const segment of path.split(".")) {
          expect(
            PLAYLIST_ITEMS_FIELDS,
            `${name} needs "${segment}" in the fields query`,
          ).toContain(segment);
        }
      }
    }
    expect(PLAYLIST_ITEMS_FIELDS).toContain("artists(name)");
    expect(PLAYLIST_ITEMS_FIELDS).toContain("is_playable");
    expect(PLAYLIST_ITEMS_FIELDS.startsWith("items(is_local,item(")).toBe(true);
  });

  it("maps a Spotify item into every declared field", () => {
    const track = trackFromItem(spotifyItem());
    expect(track).not.toBeNull();
    for (const [name] of SONG_FIELD_ENTRIES) {
      expect(
        (track as Record<string, unknown>)[name],
        `${name} was not mapped from the provider payload`,
      ).toBeDefined();
    }
    expect(track?.year).toBe(1975);
    expect(track?.artist).toBe("Artist, Guest");
    // Smallest artwork — these end up on tiny timeline cards
    expect(track?.imageUrl).toBe("small.jpg");
  });

  it("parses back everything it produced", () => {
    const track = trackFromItem(spotifyItem());
    const parsed = buildSong((name) => (track as Record<string, unknown>)[name]);
    expect(parsed).toEqual(track);
  });

  it("survives the mask — a masked song still parses", () => {
    // If this ever fails, the mask is producing something peers would reject
    // outright, i.e. the round would go dark instead of merely hidden.
    const masked = maskSecrets(FULL);
    expect(buildSong((name) => (masked as Record<string, unknown>)[name])).toEqual(
      masked,
    );
  });
});

describe("maskSecrets", () => {
  it("zeroes the year and strips every answer-revealing field", () => {
    const masked = maskSecrets(FULL) as Record<string, unknown>;
    for (const [name, spec] of SONG_FIELD_ENTRIES) {
      if (spec.secret === "strip") {
        expect(masked[name], `${name} must not survive the mask`).toBeUndefined();
      } else if (spec.secret === "zero") {
        expect(masked[name]).toBe(spec.masked);
      } else {
        expect(masked[name]).toEqual((FULL as Record<string, unknown>)[name]);
      }
    }
  });

  it("keeps the artwork — the card is visible during the window", () => {
    expect(maskSecrets(FULL).imageUrl).toBe(FULL.imageUrl);
  });

  it("does not mutate its input", () => {
    const original = { ...FULL };
    maskSecrets(FULL);
    expect(FULL).toEqual(original);
  });
});

describe("buildSong", () => {
  it("rejects a song missing a required field", () => {
    const { year, ...rest } = FULL;
    void year;
    expect(buildSong((name) => (rest as Record<string, unknown>)[name])).toBeNull();
  });

  it("accepts a masked year of 0", () => {
    const song = { ...FULL, year: 0 };
    expect(buildSong((name) => (song as Record<string, unknown>)[name])).not.toBeNull();
  });

  it("drops a malformed optional field but keeps the song", () => {
    const dirty = { ...FULL, popularity: 500, albumName: 42 };
    const parsed = buildSong((name) => (dirty as Record<string, unknown>)[name]);
    expect(parsed).not.toBeNull();
    expect(parsed?.popularity).toBeUndefined();
    expect(parsed?.albumName).toBeUndefined();
    expect(parsed?.name).toBe("Song");
  });

  it.each([
    ["a non-integer year", { year: 1975.5 }],
    ["a NaN year", { year: NaN }],
    ["a negative year", { year: -1 }],
    ["an empty id", { id: "" }],
    ["a non-string name", { name: 42 }],
  ])("rejects %s", (_label, over) => {
    const dirty = { ...FULL, ...over };
    expect(buildSong((name) => (dirty as Record<string, unknown>)[name])).toBeNull();
  });

  it("drops unknown keys", () => {
    const dirty = { ...FULL, evil: "payload" };
    const parsed = buildSong((name) => (dirty as Record<string, unknown>)[name]);
    expect("evil" in (parsed as object)).toBe(false);
  });
});

describe("trackFromItem — availability", () => {
  it("asks Spotify for the restriction reason", () => {
    expect(PLAYLIST_ITEMS_FIELDS).toContain("restrictions(reason)");
  });

  it.each(["market", "product", "explicit"])(
    "skips a track restricted by %s",
    (reason) => {
      const restricted = spotifyItem();
      restricted.item!.restrictions = { reason };
      expect(trackFromItem(restricted)).toBeNull();
    },
  );

  it("keeps a track whose availability Spotify did not state", () => {
    // Fail-OPEN on purpose: rejecting every track when the flag is missing
    // would end every game instantly.
    const unknown = spotifyItem();
    delete unknown.item!.is_playable;
    expect(trackFromItem(unknown)).not.toBeNull();
  });

  it("skips a podcast episode instead of throwing", () => {
    const episode = spotifyItem();
    delete episode.item!.album;
    delete episode.item!.artists;
    expect(() => trackFromItem(episode)).not.toThrow();
    expect(trackFromItem(episode)).toBeNull();
  });

  it("counts how often the availability flag actually arrived", () => {
    resetFieldPresence();
    trackFromItem(spotifyItem());
    const withFlag = spotifyItem();
    delete withFlag.item!.is_playable;
    trackFromItem(withFlag);

    const stats = getFieldPresence();
    expect(stats.tracksSeen).toBe(2);
    expect(stats.withIsPlayable).toBe(1);
  });

  it("counts rejections by cause", () => {
    resetFieldPresence();
    const unplayable = spotifyItem();
    unplayable.item!.is_playable = false;
    trackFromItem(unplayable);
    const restricted = spotifyItem();
    restricted.item!.restrictions = { reason: "explicit" };
    trackFromItem(restricted);

    const stats = getFieldPresence();
    expect(stats.rejectedUnplayable).toBe(1);
    expect(stats.rejectedRestricted).toBe(1);
  });
});

describe("trackFromItem", () => {
  it("skips local files and unplayable tracks", () => {
    const local = spotifyItem();
    local.is_local = true;
    expect(trackFromItem(local)).toBeNull();

    const unplayable = spotifyItem();
    unplayable.item!.is_playable = false;
    expect(trackFromItem(unplayable)).toBeNull();
  });

  it("skips a track with an unusable release date", () => {
    const broken = spotifyItem();
    broken.item!.album!.release_date = "unknown";
    expect(trackFromItem(broken)).toBeNull();
  });

  it("survives a track without optional metadata", () => {
    const sparse = spotifyItem();
    delete sparse.item!.duration_ms;
    delete sparse.item!.explicit;
    delete sparse.item!.popularity;
    delete sparse.item!.album!.images;
    const track = trackFromItem(sparse);
    expect(track).not.toBeNull();
    expect(track?.imageUrl).toBeUndefined();
    expect(track?.id).toBe("track-1");
  });
});
