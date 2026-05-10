import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { COLORS, SIZES } from "@/utils/constants";
import { sanitizeRoomCodeInput, isValidRoomCode } from "@/utils/roomCode";
import { generateRoomCode } from "@/game/logic";
import { useGameStore } from "@/game/store";

type Mode = "idle" | "join";

export default function HomeScreen() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setRoomCodeStore = useGameStore((s) => s.setRoomCode);

  useEffect(() => {
    AsyncStorage.getItem("playerName").then((stored) => {
      if (stored) setName(stored);
    });
  }, []);

  useEffect(() => {
    if (name.length >= 2) {
      AsyncStorage.setItem("playerName", name);
    }
  }, [name]);

  const handleCreate = useCallback(() => {
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    setError("");
    setLoading(true);
    const code = generateRoomCode();
    setRoomCodeStore(code);
    router.push(`/game?code=${code}&host=true&name=${encodeURIComponent(name.trim())}`);
    setLoading(false);
  }, [name, setRoomCodeStore]);

  const handleJoin = useCallback(() => {
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    if (!isValidRoomCode(roomCode)) {
      setError("Enter a valid 6-character room code");
      return;
    }
    setError("");
    setLoading(true);
    setRoomCodeStore(roomCode);
    router.push(`/game?code=${roomCode}&host=false&name=${encodeURIComponent(name.trim())}`);
    setLoading(false);
  }, [name, roomCode, setRoomCodeStore]);

  const handleRoomCodeChange = useCallback((text: string) => {
    setRoomCode(sanitizeRoomCodeInput(text));
    setError("");
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.logo}>HITSTER</Text>
          <Text style={styles.tagline}>The music guessing game</Text>

          <View style={styles.form}>
            <Input
              placeholder="Your name"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError("");
              }}
              maxLength={20}
              autoFocus
              returnKeyType={mode === "join" ? "next" : "go"}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.buttonRow}>
              <Button
                title="Create Room"
                onPress={handleCreate}
                variant={mode === "idle" ? "primary" : "secondary"}
                loading={loading && mode === "idle"}
                style={styles.flex1}
              />
              <Button
                title="Join Room"
                onPress={() => {
                  if (mode === "join") {
                    handleJoin();
                  } else {
                    setMode("join");
                  }
                }}
                variant={mode === "join" ? "primary" : "ghost"}
                loading={loading && mode === "join"}
                style={styles.flex1}
              />
            </View>

            {mode === "join" && (
              <View style={styles.joinSection}>
                <Input
                  placeholder="ROOM CODE"
                  value={roomCode}
                  onChangeText={handleRoomCodeChange}
                  maxLength={6}
                  autoCapitalize="characters"
                  returnKeyType="join"
                  onSubmitEditing={handleJoin}
                  style={{ letterSpacing: 6, textAlign: "center", fontSize: 20 } as any}
                />
                <Button
                  title="Join"
                  onPress={handleJoin}
                  disabled={!isValidRoomCode(roomCode) || name.trim().length < 2}
                />
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  container: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  logo: {
    fontSize: 48,
    fontWeight: "900",
    color: COLORS.accent,
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    color: COLORS.textSecondary,
    marginBottom: 40,
    fontSize: 16,
  },
  form: {
    width: "100%",
    gap: 16,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  joinSection: {
    gap: 12,
  },
});
