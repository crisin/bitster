import type { GameRules, GameSettings } from "./types";
import { DEFAULT_RULES } from "./types";

/**
 * Game modes are PRESETS, not a rule of their own: each one is a named point in
 * the same settings space the host can also reach by hand. Nothing in the game
 * logic ever asks "which mode is this" — it asks the rules. That keeps the mode
 * list a UI concern and makes every mode fully tunable afterwards.
 *
 * Consequently the active mode is DERIVED from the settings (`modeFor`) rather
 * than stored: a stored id could disagree with the rules it claims to describe.
 */

export interface GameMode {
  id: string;
  icon: string;
  name: string;
  /** One line, shown under the picker — say what it feels like, not what it sets */
  blurb: string;
  winScore: number;
  rules: GameRules;
}

/** Small helper so each preset only spells out what it actually changes */
function rules(over: {
  buzz?: Partial<GameRules["buzz"]>;
  placement?: Partial<GameRules["placement"]>;
  skip?: Partial<GameRules["skip"]>;
  guess?: Partial<GameRules["guess"]>;
  tokens?: Partial<GameRules["tokens"]>;
}): GameRules {
  return {
    buzz: { ...DEFAULT_RULES.buzz, ...over.buzz },
    placement: { ...DEFAULT_RULES.placement, ...over.placement },
    skip: { ...DEFAULT_RULES.skip, ...over.skip },
    guess: { ...DEFAULT_RULES.guess, ...over.guess },
    tokens: { ...DEFAULT_RULES.tokens, ...over.tokens },
  };
}

export const GAME_MODES: GameMode[] = [
  {
    id: "classic",
    icon: "🎵",
    name: "Classic",
    blurb: "The normal game. Ten songs, bitster on, no rush.",
    winScore: 10,
    rules: rules({}),
  },
  {
    id: "blitz",
    icon: "⚡",
    name: "Blitz",
    blurb: "20 seconds to place, 15 to bitster. Think later.",
    winScore: 10,
    rules: rules({
      placement: { timerSeconds: 20 },
      buzz: { timerSeconds: 15 },
    }),
  },
  {
    id: "party",
    icon: "🍹",
    name: "Party",
    blurb: "Title OR artist counts, the year may be off by two, rerolls are free.",
    winScore: 8,
    rules: rules({
      guess: { require: "either", yearTolerance: 2 },
      skip: { cost: 0 },
      buzz: { timerSeconds: 45 },
      tokens: { start: 3 },
    }),
  },
  {
    id: "connoisseur",
    icon: "🎓",
    name: "Connoisseur",
    blurb: "Title AND artist, the exact year, no rerolls — and a wrong bitster costs a point.",
    winScore: 10,
    rules: rules({
      guess: { require: "both", yearTolerance: 0 },
      skip: { enabled: false },
      buzz: { penalty: "lose-point", timerSeconds: 20 },
      tokens: { start: 1 },
    }),
  },
  {
    id: "marathon",
    icon: "🏔️",
    name: "Marathon",
    blurb: "Twenty songs and a fat wallet. Bring snacks.",
    winScore: 20,
    rules: rules({ tokens: { start: 4 }, buzz: { timerSeconds: 45 } }),
  },
  {
    id: "speedrun",
    icon: "🏁",
    name: "Speedrun",
    blurb: "Five songs, ten seconds each. Over before the drink is.",
    winScore: 5,
    rules: rules({
      placement: { timerSeconds: 10 },
      buzz: { timerSeconds: 15 },
      tokens: { start: 1 },
    }),
  },
  {
    id: "solitaire",
    icon: "🧘",
    name: "No bitster",
    blurb: "Nobody can steal your card. Just you against the years.",
    winScore: 10,
    rules: rules({ buzz: { enabled: false }, tokens: { start: 3 } }),
  },
];

/** Shown when the settings match no preset — never a selectable option */
export const CUSTOM_MODE_ID = "custom";

function sameRules(a: GameRules, b: GameRules): boolean {
  return (
    a.buzz.enabled === b.buzz.enabled &&
    a.buzz.penalty === b.buzz.penalty &&
    a.buzz.timerSeconds === b.buzz.timerSeconds &&
    a.placement.timerSeconds === b.placement.timerSeconds &&
    a.skip.enabled === b.skip.enabled &&
    a.skip.cost === b.skip.cost &&
    a.guess.require === b.guess.require &&
    a.guess.yearBonus === b.guess.yearBonus &&
    a.guess.yearTolerance === b.guess.yearTolerance &&
    a.tokens.start === b.tokens.start
  );
}

/** Which preset these settings are, or null when the host has tuned it */
export function modeFor(settings: GameSettings): GameMode | null {
  return (
    GAME_MODES.find(
      (mode) =>
        mode.winScore === settings.winScore && sameRules(mode.rules, settings.rules),
    ) ?? null
  );
}

export function getMode(id: string): GameMode | null {
  return GAME_MODES.find((m) => m.id === id) ?? null;
}

/** A one-line summary of the rules, for players who cannot change them */
export function describeRules(settings: GameSettings): string[] {
  const { rules: r } = settings;
  const guessNeeds: Record<GameRules["guess"]["require"], string> = {
    either: "title or artist",
    title: "the title",
    artist: "the artist",
    both: "title and artist",
  };
  const parts = [`first to ${settings.winScore}`, `${r.tokens.start}★ to start`];
  parts.push(`guess: ${guessNeeds[r.guess.require]}`);
  if (r.guess.yearBonus) {
    parts.push(
      r.guess.yearTolerance > 0
        ? `year ±${r.guess.yearTolerance} = +1★`
        : "exact year = +1★",
    );
  }
  parts.push(
    r.buzz.enabled ? `bitster ${r.buzz.timerSeconds}s` : "no bitster",
  );
  if (r.buzz.enabled && r.buzz.penalty === "lose-point") {
    parts.push("a missed bitster costs a point");
  }
  parts.push(
    !r.skip.enabled
      ? "no rerolls"
      : r.skip.cost === 0
        ? "free rerolls"
        : `reroll ${r.skip.cost}★`,
  );
  if (r.placement.timerSeconds !== null) {
    parts.push(`⚡ place within ${r.placement.timerSeconds}s`);
  }
  return parts;
}
