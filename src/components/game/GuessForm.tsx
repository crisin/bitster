import React, { useState, useRef } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/game/store";
import type { GuessRules } from "@/game/types";
import { FONT, SPACE, LABEL_STYLE } from "@/utils/constants";
import { createThemedStyles } from "@/theme/themedStyles";

interface GuessFormProps {
  onSubmit: (title: string, artist: string, year?: number) => void;
  disabled: boolean;
}

/** "1987"-style input → number, anything else → undefined (no year guess) */
function parseYearGuess(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!/^\d{4}$/.test(trimmed)) return undefined;
  return Number.parseInt(trimmed, 10);
}

/** Spells out what THIS game pays for — the difficulty is a per-game rule */
function describeGuess(rules: GuessRules): string {
  const song = {
    either: "Title or artist right",
    title: "Title right",
    artist: "Artist right",
    both: "Title + artist right",
  }[rules.require];
  if (!rules.yearBonus) return `${song} = +1★`;
  const year =
    rules.yearTolerance > 0
      ? `year within ${rules.yearTolerance}`
      : "exact year";
  return `${song} = +1★ · ${year} = +1★ extra`;
}

export function GuessForm({ onSubmit, disabled }: GuessFormProps) {
  const styles = useStyles();
  const rules = useGameStore((s) => s.settings.rules.guess);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState("");
  const artistRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const yearGuess = parseYearGuess(year);
  const canSubmit =
    title.trim().length > 0 || artist.trim().length > 0 || yearGuess !== undefined;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(title.trim(), artist.trim(), yearGuess);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Guess for bonus tokens</Text>
      <Input
        placeholder="Song title"
        label="Guess song title"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => artistRef.current?.focus()}
      />
      <Input
        ref={artistRef}
        placeholder="Artist"
        label="Guess artist name"
        value={artist}
        onChangeText={setArtist}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => yearRef.current?.focus()}
      />
      {rules.yearBonus && (
      <Input
        ref={yearRef}
        placeholder={rules.yearTolerance > 0 ? `Year ±${rules.yearTolerance} (+1★)` : "Exact year (+1★)"}
        label="Guess the exact release year for an extra token"
        value={year}
        onChangeText={setYear}
        keyboardType="number-pad"
        maxLength={4}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      )}
      <Text style={styles.hint}>{describeGuess(rules)}</Text>
      <Button
        title="Guess"
        onPress={handleSubmit}
        variant="secondary"
        disabled={disabled || !canSubmit}
        label="Submit guess"
      />
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) => StyleSheet.create({
  container: {
    width: "100%",
    gap: SPACE.sm,
  },
  label: {
    ...LABEL_STYLE,
    color: COLORS.textSecondary,
  },
  hint: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
}));
