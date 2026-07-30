import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MAX_SOURCE_LENGTH } from "./engine/types";

/**
 * The Shader Studio's shelf: user-written GLSL effects. Own store, own
 * storage key — shader source is a few KB each and has nothing to do with
 * the theme settings' lifecycle.
 *
 * User shaders NEVER cross the wire. They render only on the device that
 * wrote them — there is no path by which somebody else's GLSL reaches your
 * GPU, so the Studio needs no sandbox beyond what WebGL already is.
 */

export interface UserShader {
  id: string;
  name: string;
  source: string;
  /** Renders into a persistent buffer and gets u_prev — video feedback */
  feedback: boolean;
  updatedAt: number;
}

export const MAX_USER_SHADERS = 24;
const STORAGE_KEY = "bitsterShaderStudio";

/** What a fresh shader starts as — a commented playground, not a blank page */
export const STARTER_SOURCE = `// Your canvas. Every pixel asks this code what colour it is.
//
// Tools from the house:
//   u_time       seconds, respects the speed dial
//   u_beat       0..1 spike on every tapped beat
//   u_intensity  the intensity slider
//   u_accent     your theme's accent color
//   u_res        resolution of the target
//   u_frame      frames since (re)start — seed feedback with u_frame < 1.0
//   u_pointer    xy = mouse/finger (0..1, y up), z = click impulse, w = on-screen
//   u_sim        the sim dials: x = speed, y = seed density, z = kernel zoom
//   hash(p) noise(p) fbm(p) centred()
//
// Feedback ON also gives you:  texture2D(u_prev, uv)  — last frame

void main() {
  vec2 p = centred();
  float ring = 0.02 / abs(length(p) - 0.32 - 0.08 * sin(u_time + u_beat));
  vec3 col = u_accent * ring;
  col += u_accent * 0.15 * fbm(p * 3.0 + u_time * 0.1);
  gl_FragColor = vec4(col, 1.0);
}
`;

interface StudioStore {
  shaders: UserShader[];
  hydrated: boolean;
  save: (shader: Omit<UserShader, "updatedAt">) => void;
  remove: (id: string) => void;
  hydrate: () => Promise<void>;
}

function persist(): void {
  const { shaders } = useShaderStudioStore.getState();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, shaders })).catch(
    () => {
      /* best-effort, like every UI setting */
    },
  );
}

export const useShaderStudioStore = create<StudioStore>((set, get) => ({
  shaders: [],
  hydrated: false,

  save: (shader) => {
    const entry: UserShader = {
      ...shader,
      name: shader.name.trim().slice(0, 24) || "Untitled",
      source: shader.source.slice(0, MAX_SOURCE_LENGTH),
      updatedAt: Date.now(),
    };
    const shaders = [...get().shaders];
    const at = shaders.findIndex((s) => s.id === entry.id);
    if (at >= 0) shaders[at] = entry;
    else if (shaders.length < MAX_USER_SHADERS) shaders.push(entry);
    else return; // shelf is full — the editor shows the count
    set({ shaders });
    persist();
  },

  remove: (id) => {
    set({ shaders: get().shaders.filter((s) => s.id !== id) });
    persist();
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as { shaders?: unknown };
      const shaders: UserShader[] = [];
      if (Array.isArray(parsed.shaders)) {
        for (const item of parsed.shaders.slice(0, MAX_USER_SHADERS)) {
          if (typeof item !== "object" || item === null) continue;
          const s = item as Partial<UserShader>;
          if (typeof s.id !== "string" || typeof s.source !== "string") continue;
          shaders.push({
            id: s.id.slice(0, 40),
            name: typeof s.name === "string" ? s.name.slice(0, 24) : "Untitled",
            source: s.source.slice(0, MAX_SOURCE_LENGTH),
            feedback: s.feedback === true,
            updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : 0,
          });
        }
      }
      set({ shaders, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));

/** New unique id — stable enough for a local shelf of at most 24 entries */
export function newShaderId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
