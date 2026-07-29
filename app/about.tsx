import { Divider } from "@/components/ui/Divider";
import { Pressable } from "@/components/ui/Pressable";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, LABEL_STYLE, LAYOUT, RADIUS, SPACE } from "@/utils/constants";
import { router } from "expo-router";
import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import appJson from "../app.json";

const FONT_CREDITS = [
  { name: "Bebas Neue", author: "Ryoichi Tsunekawa / Dharma Type" },
  { name: "Fira Sans", author: "Mozilla Foundation & Telefónica" },
  { name: "Space Grotesk", author: "Florian Karsten" },
  { name: "Atkinson Hyperlegible", author: "Braille Institute of America" },
  { name: "JetBrains Mono", author: "JetBrains" },
];

const OFL_URL = "https://openfontlicense.org";
const SNDCLD_URL = "https://soundcloud.com/crisin";
const LRCSHLPR_URL = "https://frontend-production-e906.up.railway.app/";
const GITHUB_URL = "https://github.com/crisin/bitster";

/**
 * Info / legal page: credits, license attributions and the
 * not-affiliated-with-anyone disclaimers.
 */
export default function AboutScreen() {
  const styles = useStyles();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          label="Go back"
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.logo}>bitster</Text>
        <Text style={styles.version}>Version {appJson.expo.version}</Text>
        <Text style={styles.tagline}>The music guessing game</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Created by</Text>
          <Text style={styles.body}>crisin / krille</Text>

          <Pressable
            onPress={() => void Linking.openURL(GITHUB_URL)}
            label="Open ma uwu GitHub repository"
            style={styles.linkBtn}
          >
            <Text style={styles.link}>GitHub ↗</Text>
          </Pressable>

          <Pressable
            onPress={() => void Linking.openURL(LRCSHLPR_URL)}
            label="Open ma uwu Lyircs-Helper website"
            style={styles.linkBtn}
          >
            <Text style={styles.link}>Lyrics-Helper ↗</Text>
          </Pressable>

          <Pressable
            onPress={() => void Linking.openURL(SNDCLD_URL)}
            label="Open ma uwu SoundCloud page"
            style={styles.linkBtn}
          >
            <Text style={styles.link}>SoundCloud ↗</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What is this?</Text>
          <Text style={styles.body}>
            bitster is a free, non-commercial hobby project — a party game about
            placing songs on a timeline, played with friends over your own music
            streaming accounts.
          </Text>
          <Text style={styles.body}>
            It is an independent fan project and is not affiliated with,
            endorsed by or connected to Jumbo, the Hitster board game, or
            Spotify. Spotify is a trademark of Spotify AB.
          </Text>
          <Text style={styles.body}>
            The app streams no music itself: playback runs through each player's
            own Spotify Premium account and the official Spotify app. No audio
            is stored or redistributed.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fonts</Text>
          <Text style={styles.body}>
            All bundled fonts are free and open source under the SIL Open Font
            License 1.1:
          </Text>
          {FONT_CREDITS.map((f) => (
            <View key={f.name} style={styles.creditRow}>
              <Text style={styles.creditName}>{f.name}</Text>
              <Text style={styles.creditAuthor}>{f.author}</Text>
            </View>
          ))}
          <Pressable
            onPress={() => void Linking.openURL(OFL_URL)}
            label="Open the SIL Open Font License website"
            style={styles.linkBtn}
          >
            <Text style={styles.link}>Read the SIL Open Font License ↗</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Open source</Text>
          <Text style={styles.body}>
            Built with React Native, Expo, Zustand and other open-source
            software published under the MIT license. Thanks to everyone who
            maintains these projects.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <Text style={styles.body}>
            Questions, feedback or takedown requests:
          </Text>
          <Pressable
            onPress={() => void Linking.openURL("mailto:xxcrisinxx@gmail.com")}
            label="Send an email to the creators"
            style={styles.linkBtn}
          >
            <Text style={styles.link}>xxcrisinxx@gmail.com</Text>
          </Pressable>
        </View>

        <Divider />
        <Text style={styles.footer}>Made with ♥ and too many song replays</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      // Transparent on purpose: the Stack paints the veil over the shader
      backgroundColor: "transparent",
    },
    header: {
      height: LAYOUT.headerHeight,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACE.lg,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
    },
    headerTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
      fontSize: FONT.size.base,
    },
    backBtn: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    backIcon: {
      fontSize: FONT.size["3xl"],
      color: COLORS.textSecondary,
      lineHeight: FONT.size["3xl"] + 2,
    },
    scroll: {
      flex: 1,
    },
    content: {
      alignItems: "center",
      gap: SPACE.lg,
      padding: SPACE.xl,
      paddingBottom: SPACE["5xl"],
      maxWidth: LAYOUT.maxContentWidth,
      width: "100%",
      alignSelf: "center",
    },
    logo: {
      fontSize: FONT.size["6xl"],
      fontWeight: FONT.weight.black,
      color: COLORS.accent,
      letterSpacing: 4,
      marginTop: SPACE.lg,
    },
    version: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
    tagline: {
      color: COLORS.textSecondary,
      fontSize: FONT.size.base,
      marginBottom: SPACE.md,
    },
    card: {
      width: "100%",
      gap: SPACE.sm,
      padding: SPACE.lg,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    sectionTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
    },
    body: {
      fontSize: FONT.size.base,
      color: COLORS.textPrimary,
      lineHeight: 21,
    },
    creditRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: SPACE.md,
    },
    creditName: {
      fontSize: FONT.size.base,
      color: COLORS.textPrimary,
      fontWeight: FONT.weight.medium,
    },
    creditAuthor: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      flexShrink: 1,
      textAlign: "right",
    },
    linkBtn: {
      minHeight: 36,
      justifyContent: "center",
    },
    link: {
      fontSize: FONT.size.base,
      color: COLORS.accent,
      fontWeight: FONT.weight.medium,
    },
    footer: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.7,
      textAlign: "center",
    },
  }),
);
