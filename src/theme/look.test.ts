import { describe, expect, it } from "vitest";
import { parseLook, presetLookFor, resolveTheme } from "./look";
import { getTheme } from "./themes";

describe("presetLookFor", () => {
  it("derives the look from the built-in theme's effects", () => {
    const rave = presetLookFor("rave");
    expect(rave.effects.pulse).toBe(true);
    expect(rave.effects.glow).toBe(true);
    expect(rave.effects.floaties).toBe("🪩🔊⚡🎉");
    expect(rave.effects.melt).toBe(false);
    expect(rave.accent).toBeNull();
  });

  it("returns a stable identity — these feed zustand selectors", () => {
    expect(presetLookFor("trippy")).toBe(presetLookFor("trippy"));
  });

  it("gives the custom theme a blank slate", () => {
    const custom = presetLookFor("custom");
    expect(Object.values(custom.effects).every((v) => v === false || v === "")).
      toBe(true);
  });
});

describe("resolveTheme", () => {
  it("returns the pristine preset when no look exists", () => {
    expect(resolveTheme("neon", undefined)).toBe(getTheme("neon"));
  });

  it("applies an accent override including derived colors", () => {
    const look = { ...presetLookFor("classic"), accent: "#00b8d9" };
    const theme = resolveTheme("classic", look);
    expect(theme.colors.accent).toBe("#00b8d9");
    expect(theme.colors.borderFocused).toBe("#00b8d9");
    expect(theme.colors.accentLight).toContain("0, 184, 217");
    // The rest of the palette is untouched
    expect(theme.colors.bgPrimary).toBe(getTheme("classic")!.colors.bgPrimary);
  });

  it("lets a tweak switch effects on any built-in theme", () => {
    const look = {
      ...presetLookFor("minimal"),
      effects: { ...presetLookFor("minimal").effects, rainbow: true, shader: "kaleido" },
    };
    const theme = resolveTheme("minimal", look);
    expect(theme.effects.rainbow).toBe(true);
    expect(theme.effects.shader).toBe("kaleido");
    // resolveTheme must not mutate the preset it starts from
    expect(getTheme("minimal")!.effects.rainbow).toBe(false);
  });

  it("builds custom from the neutral base palettes", () => {
    const dark = resolveTheme("custom", undefined);
    expect(dark.id).toBe("custom");
    expect(dark.colors.bgPrimary).toBe(getTheme("classic")!.colors.bgPrimary);
    const light = resolveTheme("custom", {
      ...presetLookFor("custom"),
      base: "light",
    });
    expect(light.colors.bgPrimary).toBe(getTheme("minimal")!.colors.bgPrimary);
  });
});

describe("parseLook", () => {
  it("falls back to the preset field-by-field", () => {
    const parsed = parseLook({ effects: { melt: true } }, "rave");
    expect(parsed?.effects.melt).toBe(true);
    // Untouched fields come from the preset, not from hard-coded defaults
    expect(parsed?.effects.pulse).toBe(true);
    expect(parsed?.effects.floaties).toBe("🪩🔊⚡🎉");
  });

  it("rejects garbage wholesale but sanitizes fields", () => {
    expect(parseLook("nonsense", "classic")).toBeNull();
    const parsed = parseLook(
      { accent: "not-a-color", shaderIntensity: 99 },
      "classic",
    );
    expect(parsed?.accent).toBeNull();
    expect(parsed?.shaderIntensity).toBe(1);
  });

  it("keeps the guard on unless it was explicitly off", () => {
    expect(parseLook({}, "classic")?.shaderGuard).toBe(true);
    expect(parseLook({ shaderGuard: false }, "classic")?.shaderGuard).toBe(false);
  });
});
