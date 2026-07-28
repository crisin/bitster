import { Chip } from "@/components/ui/Chip";
import { Pressable } from "@/components/ui/Pressable";
import { useGameStore } from "@/game/store";
import { describeRules, GAME_MODES, modeFor } from "@/game/modes";
import type { GameRules, GuessRequirement } from "@/game/types";
import {
  BUZZ_TIMER_OPTIONS,
  PLACEMENT_TIMER_OPTIONS,
  SKIP_COST_OPTIONS,
  START_TOKEN_OPTIONS,
  WIN_SCORE_OPTIONS,
  YEAR_TOLERANCE_OPTIONS,
} from "@/game/types";
import { dispatch } from "@/p2p/connection";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, LABEL_STYLE, RADIUS, SPACE } from "@/utils/constants";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface GameSettingsProps {
  /** Peers see the same rules, they just cannot touch them */
  readOnly?: boolean;
}

const GUESS_LABELS: { value: GuessRequirement; label: string }[] = [
  { value: "either", label: "Title OR artist" },
  { value: "title", label: "Title only" },
  { value: "artist", label: "Artist only" },
  { value: "both", label: "Title AND artist" },
];

/** One labelled row of chips — the whole settings sheet is built from these */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.settingRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>{children}</View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function GameSettings({ readOnly = false }: GameSettingsProps) {
  const styles = useStyles();
  const settings = useGameStore((s) => s.settings);
  const [tuning, setTuning] = useState(false);

  const rules = settings.rules;
  const mode = modeFor(settings);

  /** Every change goes out as a whole rules object — the host replaces it wholesale */
  const patchRules = (patch: Partial<GameRules>) => {
    dispatch({
      type: "update-settings",
      payload: { rules: { ...rules, ...patch } },
    });
  };

  const pickMode = (id: string) => {
    const preset = GAME_MODES.find((m) => m.id === id);
    if (!preset) return;
    dispatch({
      type: "update-settings",
      payload: { winScore: preset.winScore, rules: preset.rules },
    });
  };

  // Peers get the summary, not the switchboard
  if (readOnly) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Mode</Text>
        <Text style={styles.modeName}>
          {mode ? `${mode.icon} ${mode.name}` : "⚙️ Custom"}
        </Text>
        <View style={styles.chips}>
          {describeRules(settings).map((part) => (
            <Text key={part} style={styles.summaryChip}>
              {part}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Game mode</Text>
      <View style={styles.chips}>
        {GAME_MODES.map((m) => (
          <Chip
            key={m.id}
            label={`${m.icon} ${m.name}`}
            selected={mode?.id === m.id}
            onPress={() => pickMode(m.id)}
          />
        ))}
        {/* Only ever a readout: you reach Custom by tuning, not by picking it.
            Pressing it just opens the dials that produced it. */}
        {mode === null && (
          <Chip label="⚙️ Custom" selected onPress={() => setTuning(true)} />
        )}
      </View>
      <Text style={styles.blurb}>
        {mode ? mode.blurb : "Your own mix — every dial below is yours."}
      </Text>

      <Pressable
        onPress={() => setTuning((v) => !v)}
        label={`${tuning ? "Hide" : "Show"} the individual rules`}
        style={styles.tuneToggle}
      >
        <Text style={styles.tuneToggleText}>
          {tuning ? "▾" : "▸"} Fine-tuning
        </Text>
      </Pressable>

      {!tuning && (
        <View style={styles.chips}>
          {describeRules(settings).map((part) => (
            <Text key={part} style={styles.summaryChip}>
              {part}
            </Text>
          ))}
        </View>
      )}

      {tuning && (
        <View style={styles.tuneBox}>
          <Row label="Win at">
            {WIN_SCORE_OPTIONS.map((n) => (
              <Chip
                key={n}
                label={`${n} songs`}
                selected={settings.winScore === n}
                onPress={() =>
                  dispatch({
                    type: "update-settings",
                    payload: { winScore: n },
                  })
                }
              />
            ))}
          </Row>

          <Row
            label="Difficulty — a guess counts when you get"
            hint="What the +1★ costs you in knowledge. Placing the card is unaffected."
          >
            {GUESS_LABELS.map((g) => (
              <Chip
                key={g.value}
                label={g.label}
                selected={rules.guess.require === g.value}
                onPress={() =>
                  patchRules({ guess: { ...rules.guess, require: g.value } })
                }
              />
            ))}
          </Row>

          <Row
            label="Year bonus"
            hint={
              rules.guess.yearBonus && rules.guess.yearTolerance > 0
                ? "A little slack also covers remasters, whose year is wrong in the data itself."
                : undefined
            }
          >
            <Chip
              label="Off"
              selected={!rules.guess.yearBonus}
              onPress={() =>
                patchRules({ guess: { ...rules.guess, yearBonus: false } })
              }
            />
            {YEAR_TOLERANCE_OPTIONS.map((t) => (
              <Chip
                key={t}
                label={t === 0 ? "Exact" : `±${t}`}
                selected={
                  rules.guess.yearBonus && rules.guess.yearTolerance === t
                }
                onPress={() =>
                  patchRules({
                    guess: { ...rules.guess, yearBonus: true, yearTolerance: t },
                  })
                }
              />
            ))}
          </Row>

          <Row label="Starting ★">
            {START_TOKEN_OPTIONS.map((n) => (
              <Chip
                key={n}
                label={`${n}★`}
                selected={rules.tokens.start === n}
                onPress={() => patchRules({ tokens: { start: n } })}
              />
            ))}
          </Row>

          <Row
            label="⚡ bitster (steal a card)"
            hint={
              rules.buzz.enabled
                ? undefined
                : "Off means nobody can take a card off you — and the window is skipped entirely."
            }
          >
            <Chip
              label="Off"
              selected={!rules.buzz.enabled}
              onPress={() =>
                patchRules({ buzz: { ...rules.buzz, enabled: false } })
              }
            />
            <Chip
              label="On"
              selected={rules.buzz.enabled}
              onPress={() =>
                patchRules({ buzz: { ...rules.buzz, enabled: true } })
              }
            />
          </Row>

          {rules.buzz.enabled && (
            <>
              <Row label="bitster timer">
                {BUZZ_TIMER_OPTIONS.map((n) => (
                  <Chip
                    key={n}
                    label={`${n}s`}
                    selected={rules.buzz.timerSeconds === n}
                    onPress={() =>
                      patchRules({ buzz: { ...rules.buzz, timerSeconds: n } })
                    }
                  />
                ))}
              </Row>
              <Row label="Wrong bitster">
                <Chip
                  label="Just costs the ★"
                  selected={rules.buzz.penalty === "none"}
                  onPress={() =>
                    patchRules({ buzz: { ...rules.buzz, penalty: "none" } })
                  }
                />
                <Chip
                  label="−1 point, forever"
                  selected={rules.buzz.penalty === "lose-point"}
                  onPress={() =>
                    patchRules({
                      buzz: { ...rules.buzz, penalty: "lose-point" },
                    })
                  }
                />
              </Row>
            </>
          )}

          <Row
            label="🎲 Reroll (skip the song)"
            hint={
              rules.skip.enabled && rules.skip.cost === 0
                ? "Free rerolls: nobody ever has to place a song they've never heard."
                : undefined
            }
          >
            <Chip
              label="Off"
              selected={!rules.skip.enabled}
              onPress={() =>
                patchRules({ skip: { ...rules.skip, enabled: false } })
              }
            />
            {SKIP_COST_OPTIONS.map((c) => (
              <Chip
                key={c}
                label={c === 0 ? "Free" : `${c}★`}
                selected={rules.skip.enabled && rules.skip.cost === c}
                onPress={() => patchRules({ skip: { enabled: true, cost: c } })}
              />
            ))}
          </Row>

          <Row label="⚡ Blitz — place within">
            {PLACEMENT_TIMER_OPTIONS.map((n) => (
              <Chip
                key={n === null ? "off" : n}
                label={n === null ? "Off" : `${n}s`}
                selected={rules.placement.timerSeconds === n}
                onPress={() => patchRules({ placement: { timerSeconds: n } })}
              />
            ))}
          </Row>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      width: "100%",
      gap: SPACE.sm,
    },
    label: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
    },
    chips: {
      flexDirection: "row",
      gap: SPACE.sm,
      flexWrap: "wrap",
    },
    blurb: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      lineHeight: 18,
    },
    modeName: {
      fontSize: FONT.size.md,
      fontWeight: FONT.weight.semibold,
      color: COLORS.textPrimary,
    },
    summaryChip: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      paddingVertical: 3,
      paddingHorizontal: SPACE.sm,
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.border,
      overflow: "hidden",
    },
    tuneToggle: {
      minHeight: 36,
      justifyContent: "center",
    },
    tuneToggleText: {
      ...LABEL_STYLE,
      color: COLORS.accent,
    },
    tuneBox: {
      gap: SPACE.md,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgElevated,
    },
    settingRow: {
      gap: SPACE.xs,
    },
    hint: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.8,
      lineHeight: 16,
    },
  }),
);
