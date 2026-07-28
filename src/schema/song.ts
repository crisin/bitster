/**
 * The one place a song field is declared.
 *
 * A song crosses three boundaries — the streaming provider's payload, the wire
 * to the peers, and the answer mask that hides the round's solution. Each used
 * to be maintained by hand, so a forgotten field either vanished silently at
 * the peer boundary or leaked the answer. Everything here is derived from
 * SONG_FIELDS instead: the type, the parser, the mask, and the provider's field
 * query.
 *
 * This module is a leaf: it imports nothing, so both game/ and streaming/ can
 * depend on it without creating an edge between them.
 */

/** Runtime kinds a song field can have on the wire. No nested objects. */
export type SongFieldKind = "string" | "int" | "bool";
export type SongFieldValue = string | number | boolean;

interface SongFieldBase {
  readonly kind: SongFieldKind;
  /** Inclusive bounds, "int" only */
  readonly min?: number;
  readonly max?: number;
  /** Inclusive length bounds, "string" only */
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly doc?: string;
}

/**
 * `secret` says what happens to the field while the round's answer is still
 * hidden:
 *   "keep"  – harmless, ships as-is
 *   "strip" – removed from the broadcast (optional fields only)
 *   "zero"  – replaced by `masked`, because peers need the key present
 *
 * The union makes "required + strip" unrepresentable, so the mask can never
 * produce a song the parser would then reject.
 */
export type SongFieldSpec =
  | (SongFieldBase & { readonly required: true; readonly secret: "keep" })
  | (SongFieldBase & {
      readonly required: true;
      readonly secret: "zero";
      readonly masked: SongFieldValue;
    })
  | (SongFieldBase & {
      readonly required: false;
      readonly secret: "keep" | "strip";
    });

export const SONG_FIELDS = {
  id: { kind: "string", required: true, secret: "keep", minLength: 1, maxLength: 999 },
  uri: { kind: "string", required: true, secret: "keep", minLength: 1, maxLength: 999 },
  name: { kind: "string", required: true, secret: "keep" },
  artist: {
    kind: "string",
    required: true,
    secret: "keep",
    doc: "comma-separated when there are several",
  },
  year: {
    kind: "int",
    required: true,
    secret: "zero",
    masked: 0,
    min: 0,
    doc: "0 = masked by the host while the round is still being guessed",
  },
  imageUrl: {
    kind: "string",
    required: false,
    secret: "keep",
    doc: "card art — shown during the window, so it must not be stripped",
  },
  durationMs: { kind: "int", required: false, secret: "strip", min: 0 },
  explicit: { kind: "bool", required: false, secret: "strip" },
  popularity: {
    kind: "int",
    required: false,
    secret: "strip",
    min: 0,
    max: 100,
    doc: "0-100 — drives the Deep Cut / Banger badges in the reveal",
  },
  albumName: { kind: "string", required: false, secret: "strip" },
} as const satisfies Record<string, SongFieldSpec>;

export type SongFieldName = keyof typeof SONG_FIELDS;

/** Object.entries is lossy about keys — one documented cast, no `any` */
export const SONG_FIELD_ENTRIES = Object.entries(SONG_FIELDS) as [
  SongFieldName,
  SongFieldSpec,
][];

// -- Type derivation --------------------------------------------------------

type KindType = { string: string; int: number; bool: boolean };
type Spec = typeof SONG_FIELDS;

type RequiredName = {
  [K in SongFieldName]: Spec[K]["required"] extends true ? K : never;
}[SongFieldName];
type OptionalName = Exclude<SongFieldName, RequiredName>;

/** Homomorphic identity map — flattens the intersection and keeps `?` */
type Simplify<T> = { [K in keyof T]: T[K] };

export type SongShape = Simplify<
  { [K in RequiredName]: KindType[Spec[K]["kind"]] } & {
    [K in OptionalName]?: KindType[Spec[K]["kind"]];
  }
>;

// -- Runtime ----------------------------------------------------------------

/** One validator for both directions: wire input and provider output. */
export function matchesSpec(
  spec: SongFieldSpec,
  value: unknown,
): value is SongFieldValue {
  switch (spec.kind) {
    case "string":
      if (typeof value !== "string") return false;
      if (spec.minLength !== undefined && value.length < spec.minLength)
        return false;
      if (spec.maxLength !== undefined && value.length > spec.maxLength)
        return false;
      return true;
    case "int":
      // Number.isInteger already rejects NaN and Infinity
      if (typeof value !== "number" || !Number.isInteger(value)) return false;
      if (spec.min !== undefined && value < spec.min) return false;
      if (spec.max !== undefined && value > spec.max) return false;
      return true;
    case "bool":
      return typeof value === "boolean";
  }
}

/**
 * Assemble a song from a per-field lookup. Returns null when a REQUIRED field
 * is missing or malformed; a malformed OPTIONAL field is dropped and the song
 * survives — the same tolerance the rest of the protocol uses.
 */
export function buildSong(
  read: (name: SongFieldName, spec: SongFieldSpec) => unknown,
): SongShape | null {
  const out: Partial<SongShape> = {};
  for (const [name, spec] of SONG_FIELD_ENTRIES) {
    const value = read(name, spec);
    if (value === undefined || value === null || !matchesSpec(spec, value)) {
      if (spec.required) return null;
      continue;
    }
    // One localized cast: matchesSpec proves the key/value pairing, the
    // compiler cannot.
    (out as Record<string, SongFieldValue>)[name] = value;
  }
  return out as SongShape;
}

/**
 * Strip or zero every field flagged secret. Pure, and guaranteed to return
 * something buildSong still accepts (see the SongFieldSpec union).
 */
export function maskSecrets(song: SongShape): SongShape {
  const masked = { ...song } as Record<string, SongFieldValue | undefined>;
  for (const [name, spec] of SONG_FIELD_ENTRIES) {
    if (spec.secret === "keep") continue;
    if (spec.secret === "zero") {
      masked[name] = spec.masked;
    } else {
      delete masked[name];
    }
  }
  return masked as SongShape;
}
