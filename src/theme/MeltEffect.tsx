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
  /** Theme background — fills the torn screen edges so no white bleeds in */
  backdropColor: string;
}

export function MeltEffect({ intensity, tempo, backdropColor }: MeltEffectProps) {
  // The rAF loop reads live values from a ref — rebuilding the filter (and
  // visibly un-melting the screen) on every slider tick would flicker badly
  const params = useRef({ intensity, tempo });
  params.current = { intensity, tempo };
  const floodRef = useRef<SVGElement | null>(null);

  // Keep the edge fill in sync with the theme without rebuilding the filter
  useEffect(() => {
    floodRef.current?.setAttribute("flood-color", backdropColor);
  }, [backdropColor]);

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
    // linearRGB (the default) shifts the displacement zero-point and adds
    // banding — sRGB keeps the warp centered and smooth
    filter.setAttribute("color-interpolation-filters", "sRGB");

    // ONE coarse octave: big soft blobs instead of grainy high-frequency
    // tearing (the second octave was what looked pixelated)
    const turbulence = document.createElementNS(svgNS, "feTurbulence");
    turbulence.setAttribute("type", "fractalNoise");
    turbulence.setAttribute("baseFrequency", "0.006 0.012");
    turbulence.setAttribute("numOctaves", "1");
    turbulence.setAttribute("seed", "7");
    turbulence.setAttribute("result", "noise");

    // Pre-smooth the displacement MAP (not the UI) — the warp field itself
    // becomes buttery, so edges bend instead of stair-stepping
    const noiseBlur = document.createElementNS(svgNS, "feGaussianBlur");
    noiseBlur.setAttribute("in", "noise");
    noiseBlur.setAttribute("stdDeviation", "8");
    noiseBlur.setAttribute("result", "smoothNoise");

    const displacement = document.createElementNS(svgNS, "feDisplacementMap");
    displacement.setAttribute("in", "SourceGraphic");
    displacement.setAttribute("in2", "smoothNoise");
    displacement.setAttribute("scale", "0");
    displacement.setAttribute("xChannelSelector", "R");
    displacement.setAttribute("yChannelSelector", "G");
    displacement.setAttribute("result", "warped");

    // Whisper of post-blur as anti-aliasing over the displaced pixels —
    // way below text-legibility territory, just melts the jaggies
    const antialias = document.createElementNS(svgNS, "feGaussianBlur");
    antialias.setAttribute("in", "warped");
    antialias.setAttribute("stdDeviation", "0.4");
    antialias.setAttribute("result", "smoothWarped");

    // Displacement pulls pixels in from beyond the screen edge where the
    // source has none — flood the filter region with the theme background
    // UNDER the warped image, so edges tear into theme color, not white
    const flood = document.createElementNS(svgNS, "feFlood");
    flood.setAttribute("flood-color", backdropColor);
    flood.setAttribute("result", "edgeFill");
    floodRef.current = flood;

    const merge = document.createElementNS(svgNS, "feMerge");
    const mergeBg = document.createElementNS(svgNS, "feMergeNode");
    mergeBg.setAttribute("in", "edgeFill");
    const mergeFg = document.createElementNS(svgNS, "feMergeNode");
    mergeFg.setAttribute("in", "smoothWarped");
    merge.appendChild(mergeBg);
    merge.appendChild(mergeFg);

    filter.appendChild(turbulence);
    filter.appendChild(noiseBlur);
    filter.appendChild(displacement);
    filter.appendChild(antialias);
    filter.appendChild(flood);
    filter.appendChild(merge);
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

      // Slow independent drift keeps the noise pattern itself alive —
      // range stays coarse so the warp never turns grainy again
      const drift = 0.006 + 0.002 * Math.sin(seconds * 0.3 * t.factor);
      turbulence.setAttribute(
        "baseFrequency",
        `${drift.toFixed(4)} ${(drift * 2).toFixed(4)}`,
      );
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      root.style.filter = "";
      floodRef.current = null;
      svg.remove();
    };
  }, []);

  return null;
}
