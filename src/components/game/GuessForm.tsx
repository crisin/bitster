import React, { useState, useRef } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
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

export function GuessForm({ onSubmit, disabled }: GuessFormProps) {
  const styles = useStyles();
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
      <Input
        ref={yearRef}
        placeholder="Exact year (+1★)"
        label="Guess the exact release year for an extra token"
        value={year}
        onChangeText={setYear}
        keyboardType="number-pad"
        maxLength={4}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      <Text style={styles.hint}>
        Title + artist right = +1★ · exact year = +1★ extra
      </Text>
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
