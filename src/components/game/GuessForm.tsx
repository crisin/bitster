import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { COLORS, SIZES } from "@/utils/constants";

interface GuessFormProps {
  onSubmit: (title: string, artist: string) => void;
  disabled: boolean;
}

export function GuessForm({ onSubmit, disabled }: GuessFormProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!title.trim() && !artist.trim()) return;
    onSubmit(title.trim(), artist.trim());
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <Text style={styles.submitted}>Guess submitted!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Guess for bonus tokens</Text>
      <Input
        placeholder="Song title"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
      />
      <Input
        placeholder="Artist"
        value={artist}
        onChangeText={setArtist}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      <Button
        title="Guess"
        onPress={handleSubmit}
        variant="secondary"
        disabled={disabled || (!title.trim() && !artist.trim())}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  submitted: {
    fontSize: 14,
    color: COLORS.success,
    textAlign: "center",
    paddingVertical: 8,
  },
});
