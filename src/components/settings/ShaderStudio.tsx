import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Pressable } from "@/components/ui/Pressable";
import { checkFragment } from "@/theme/shader/engine/engine.web";
import { specFromUserShader } from "@/theme/shader/engine/compile";
import {
  MAX_USER_SHADERS,
  newShaderId,
  STARTER_SOURCE,
  useShaderStudioStore,
} from "@/theme/shader/studio";
import { useCurrentLook, useThemeStore } from "@/theme/store";
import { createThemedStyles } from "@/theme/themedStyles";
import { FONT, LABEL_STYLE, RADIUS, SPACE } from "@/utils/constants";

const CHECK_DEBOUNCE_MS = 400;

/**
 * A 1×1 context used ONLY for syntax checking drafts. Lazy and shared — the
 * browser caps live WebGL contexts, and this one never draws a pixel.
 */
let checkGl: WebGLRenderingContext | null | undefined;
function getCheckContext(): WebGLRenderingContext | null {
  if (checkGl !== undefined) return checkGl;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  checkGl = canvas.getContext("webgl");
  return checkGl;
}

type CompileState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

/**
 * Write-your-own-shader editor. The draft compiles live against a hidden GL
 * context and errors point at YOUR line numbers, not the assembled file's.
 * Saved shaders are local to this device and never cross the wire.
 */
export function ShaderStudio() {
  const styles = useStyles();
  const shaders = useShaderStudioStore((s) => s.shaders);
  const save = useShaderStudioStore((s) => s.save);
  const remove = useShaderStudioStore((s) => s.remove);
  const look = useCurrentLook();
  const updateLookEffects = useThemeStore((s) => s.updateLookEffects);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [feedback, setFeedback] = useState(false);
  const [compile, setCompile] = useState<CompileState>({ kind: "idle" });
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = editingId !== null;

  const startNew = () => {
    setEditingId(newShaderId());
    setName(`Shader ${shaders.length + 1}`);
    setSource(STARTER_SOURCE);
    setFeedback(false);
    setCompile({ kind: "idle" });
  };

  const startEdit = (id: string) => {
    const shader = shaders.find((s) => s.id === id);
    if (!shader) return;
    setEditingId(shader.id);
    setName(shader.name);
    setSource(shader.source);
    setFeedback(shader.feedback);
    setCompile({ kind: "idle" });
  };

  // Live syntax check, debounced — the whole reason the Studio is usable
  useEffect(() => {
    if (!open || !source) return;
    setCompile({ kind: "checking" });
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => {
      const gl = getCheckContext();
      if (!gl) {
        setCompile({ kind: "error", message: "No WebGL available" });
        return;
      }
      // The author's pass is always the first one of their spec
      const pass = specFromUserShader({ id: "draft", source, feedback })
        .passes[0];
      const error = checkFragment(gl, pass);
      setCompile(error ? { kind: "error", message: error } : { kind: "ok" });
    }, CHECK_DEBOUNCE_MS);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [source, feedback, open]);

  const handleSave = () => {
    if (editingId === null) return;
    save({ id: editingId, name, source, feedback });
    // Saving is also applying — the layer picks the change up live
    updateLookEffects({ shader: `user:${editingId}` });
  };

  const handleDelete = () => {
    if (editingId === null) return;
    if (look.effects.shader === `user:${editingId}`) {
      updateLookEffects({ shader: "" });
    }
    remove(editingId);
    setEditingId(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>
        Shader Studio — write your own ({shaders.length}/{MAX_USER_SHADERS})
      </Text>
      <View style={styles.chipRow}>
        {shaders.map((shader) => (
          <Chip
            key={shader.id}
            label={
              look.effects.shader === `user:${shader.id}`
                ? `▶ ${shader.name}`
                : shader.name
            }
            selected={editingId === shader.id}
            onPress={() => startEdit(shader.id)}
          />
        ))}
        {shaders.length < MAX_USER_SHADERS && (
          <Chip label="+ New" selected={false} onPress={startNew} />
        )}
      </View>

      {open && (
        <View style={styles.editor}>
          <Input
            placeholder="Shader name"
            label="Shader name"
            value={name}
            onChangeText={setName}
            maxLength={24}
          />
          <View style={styles.chipRow}>
            <Chip
              label="🔁 Feedback (u_prev)"
              selected={feedback}
              onPress={() => setFeedback((v) => !v)}
            />
          </View>
          {feedback && (
            <Text style={styles.hint}>
              Your shader renders into a persistent buffer and can read its own
              last frame via texture2D(u_prev, uv). Seed with u_frame &lt; 1.0.
            </Text>
          )}

          <TextInput
            value={source}
            onChangeText={setSource}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel="GLSL fragment shader source"
            style={styles.code}
          />

          {compile.kind === "ok" && (
            <Text style={styles.compileOk}>✓ compiles</Text>
          )}
          {compile.kind === "checking" && (
            <Text style={styles.compileChecking}>compiling…</Text>
          )}
          {compile.kind === "error" && (
            <Text style={styles.compileError}>{compile.message}</Text>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleDelete}
              label="Delete this shader"
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
            <Pressable
              onPress={() => setEditingId(null)}
              label="Close the editor"
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              label="Save this shader and use it"
              style={[
                styles.saveBtn,
                compile.kind === "error" && styles.saveBtnRisky,
              ]}
            >
              <Text style={styles.saveText}>
                {compile.kind === "error" ? "Save anyway" : "Save & use"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((COLORS) =>
  StyleSheet.create({
    container: {
      gap: SPACE.sm,
      marginTop: SPACE.md,
    },
    sectionTitle: {
      ...LABEL_STYLE,
      color: COLORS.textSecondary,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: SPACE.sm,
    },
    editor: {
      gap: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgCard,
    },
    hint: {
      fontSize: FONT.size.xs,
      color: COLORS.textSecondary,
      opacity: 0.8,
      lineHeight: 16,
    },
    code: {
      minHeight: 260,
      padding: SPACE.md,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: COLORS.border,
      backgroundColor: COLORS.bgPrimary,
      color: COLORS.textPrimary,
      fontFamily: "JetBrainsMono_400Regular, monospace",
      fontSize: 13,
      lineHeight: 19,
      textAlignVertical: "top",
    },
    compileOk: {
      fontSize: FONT.size.sm,
      color: COLORS.success,
      fontWeight: FONT.weight.semibold,
    },
    compileChecking: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
      opacity: 0.7,
    },
    compileError: {
      fontSize: FONT.size.sm,
      color: COLORS.error,
      fontFamily: "JetBrainsMono_400Regular, monospace",
      lineHeight: 18,
    },
    buttonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACE.md,
    },
    deleteBtn: {
      minHeight: 40,
      justifyContent: "center",
    },
    deleteText: {
      fontSize: FONT.size.sm,
      color: COLORS.error,
    },
    closeBtn: {
      minHeight: 40,
      justifyContent: "center",
      marginLeft: "auto",
    },
    closeText: {
      fontSize: FONT.size.sm,
      color: COLORS.textSecondary,
    },
    saveBtn: {
      minHeight: 40,
      paddingHorizontal: SPACE.lg,
      borderRadius: RADIUS.md,
      backgroundColor: COLORS.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtnRisky: {
      opacity: 0.6,
    },
    saveText: {
      fontSize: FONT.size.sm,
      fontWeight: FONT.weight.bold,
      color: COLORS.textInverse,
    },
  }),
);
