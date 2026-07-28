import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import type { EffectTempo } from "./effectTempo";

/**
 * Melt Mode 🫠 — the whole UI liquefies.
 *
 * Web-only: an SVG displacement filter (feTurbulence + feDisplacementMap) is
 * applied as a CSS filter to the app root, so the REAL, live, interactive UI
 * melts — no WebGL, no snapshot. A rAF loop breathes the displacement scale
 * (beat-locked in BPM mode) and slowly drifts the noise frequency so the goo
 * feels alive.
 *
 * Knowingly excluded: Safari (ignores CSS filter:url() on HTML content) and
 * users with prefers-reduced-motion (full-screen distortion is nausea fuel).
 * RN-web Modals portal into document.body, so the settings sheet stays crisp —
 * the escape hatch never melts.
 */

const SVG_ID = "bitster-melt-svg";
const FILTER_ID = "bitster-melt";
/** Displacement in px at intensity 1 — beyond this, hit targets drift too far */
const MAX_SCALE = 55;

function meltSupported(): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  // Safari parses filter:url() but doesn't apply SVG filters to HTML content
  const ua = navigator.userAgent;
  const isSafari =
    /safari/i.test(ua) && !/chrome|chromium|crios|fxios|android|edg/i.test(ua);
  return !isSafari;
}

interface MeltEffectProps {
  /** 0 = off … 1 = full goo */
  intensity: number;
  tempo: EffectTempo;
}

export function MeltEffect({ intensity, tempo }: MeltEffectProps) {
  // The rAF loop reads live values from a ref — rebuilding the filter (and
  // visibly un-melting the screen) on every slider tick would flicker badly
  const params = useRef({ intensity, tempo });
  params.current = { intensity, tempo };

  useEffect(() => {
    if (!meltSupported()) return;
    const root = document.getElementById("root");
    if (!root) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.id = SVG_ID;
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";

    const filter = document.createElementNS(svgNS, "filter");
    filter.id = FILTER_ID;
    // Oversized filter region so displaced pixels at the edges don't clip
    filter.setAttribute("x", "-15%");
    filter.setAttribute("y", "-15%");
    filter.setAttribute("width", "130%");
    filter.setAttribute("height", "130%");

    const turbulence = document.createElementNS(svgNS, "feTurbulence");
    turbulence.setAttribute("type", "fractalNoise");
    turbulence.setAttribute("baseFrequency", "0.008 0.016");
    turbulence.setAttribute("numOctaves", "2");
    turbulence.setAttribute("seed", "7");
    turbulence.setAttribute("result", "noise");

    const displacement = document.createElementNS(svgNS, "feDisplacementMap");
    displacement.setAttribute("in", "SourceGraphic");
    displacement.setAttribute("in2", "noise");
    displacement.setAttribute("scale", "0");
    displacement.setAttribute("xChannelSelector", "R");
    displacement.setAttribute("yChannelSelector", "G");

    filter.appendChild(turbulence);
    filter.appendChild(displacement);
    svg.appendChild(filter);
    document.body.appendChild(svg);

    // Apply the filter immediately — rAF only runs while the tab composites,
    // and the melt must hold its shape even when the animation is paused
    const applyStatic = () => {
      const { intensity: level } = params.current;
      if (level <= 0) {
        root.style.filter = "";
        return false;
      }
      displacement.setAttribute("scale", (MAX_SCALE * level * 0.65).toFixed(1));
      root.style.filter = `url(#${FILTER_ID})`;
      return true;
    };
    let filterApplied = applyStatic();

    let rafId = 0;
    let frame = 0;
    const t0 = performance.now();

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      // Half the display rate is plenty for goo — fullscreen turbulence is
      // the most expensive thing this app renders
      if (frame++ % 2 === 1) return;

      const { intensity: level, tempo: t } = params.current;
      if (level <= 0) {
        if (filterApplied) {
          root.style.filter = "";
          filterApplied = false;
        }
        return;
      }
      if (!filterApplied) {
        root.style.filter = `url(#${FILTER_ID})`;
        filterApplied = true;
      }

      const seconds = (now - t0) / 1000;
      // BPM mode: one full breath per beat; otherwise the speed factor rules
      const wobbleHz = t.bpm !== null ? t.bpm / 60 : 0.4 * t.factor;
      const maxScale = MAX_SCALE * level;
      const scale =
        maxScale * (0.65 + 0.35 * Math.sin(seconds * wobbleHz * 2 * Math.PI));
      displacement.setAttribute("scale", scale.toFixed(1));

      // Slow independent drift keeps the noise pattern itself alive
      const drift = 0.008 + 0.0035 * Math.sin(seconds * 0.3 * t.factor);
      turbulence.setAttribute(
        "baseFrequency",
        `${drift.toFixed(4)} ${(drift * 2).toFixed(4)}`,
      );
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      root.style.filter = "";
      svg.remove();
    };
  }, []);

  return null;
}
