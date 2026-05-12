import React, { useState, useRef } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { COLORS, FONT, SPACE, LABEL_STYLE } from "@/utils/constants";

interface GuessFormProps {
  onSubmit: (title: string, artist: string) => void;
  disabled: boolean;
}

export function GuessForm({ onSubmit, disabled }: GuessFormProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const artistRef = useRef<TextInput>(null);

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
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      <Button
        title="Guess"
        onPress={handleSubmit}
        variant="secondary"
        disabled={disabled || (!title.trim() && !artist.trim())}
        label="Submit guess"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: SPACE.sm,
  },
  label: {
    ...LABEL_STYLE,
  },
  submitted: {
    fontSize: FONT.size.base,
    color: COLORS.success,
    textAlign: "center",
    paddingVertical: SPACE.sm,
  },
});
