import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { useEffect, useRef, useState } from "react";

/**
 * What the effect layer is allowed to know about the game.
 *
 * Deliberately three numbers and nothing else: the shaders must not grow a
 * dependency on the game model, and the theme layer must not start making
 * decisions about gameplay. This hook is the entire coupling — one direction,
 * one shape.
 */
export interface GamePulse {
  /** 0 lobby · 0.25 playing · 0.5 bitster window · 0.75 reveal · 1 finished */
  phase: number;
  /** 0..1, rising as a countdown runs out — 0 when no clock is running */
  urgency: number;
  /** +1 the card was placed right, −1 wrong, 0 nothing happened yet */
  result: number;
  /** Epoch ms of that result, so the layer can decay the flash itself */
  resultAt: number;
}

const PHASE_VALUE: Record<string, number> = {
  lobby: 0,
  playing: 0.25,
  "bitster-window": 0.5,
  reveal: 0.75,
  finished: 1,
};

/** Below this the clock is not worth reacting to yet */
const URGENCY_WINDOW_MS = 12_000;
const URGENCY_TICK_MS = 120;

export function useGamePulse(): GamePulse {
  const phase = useGameStore((s) => s.phase);
  const placeDeadline = useGameStore((s) => s.placeDeadline);
  const buzzDeadline = useGameStore((s) => s.buzzDeadline);
  // Deadlines are host-clock absolutes — the same offset the countdown pill uses
  const clockOffsetMs = useP2PStore((s) => s.clockOffsetMs);
  const lastResult = useGameStore((s) => s.lastResult);

  const [urgency, setUrgency] = useState(0);
  const resultRef = useRef({ result: 0, at: 0 });

  // A result is an EVENT, but the store only holds state — remember when it
  // flipped so the flash can decay from there
  const correct = lastResult?.correct;
  useEffect(() => {
    if (correct === undefined) return;
    resultRef.current = { result: correct ? 1 : -1, at: Date.now() };
  }, [correct]);

  const deadline = placeDeadline ?? buzzDeadline;
  useEffect(() => {
    if (deadline === null) {
      setUrgency(0);
      return;
    }
    // Polled rather than animated: this feeds a shader uniform, not a view, and
    // a 120 ms step is finer than anyone can see in a background effect
    const tick = () => {
      const left = deadline - (Date.now() + clockOffsetMs);
      const raw = 1 - Math.min(1, Math.max(0, left) / URGENCY_WINDOW_MS);
      setUrgency(left <= 0 ? 1 : raw);
    };
    tick();
    const timer = setInterval(tick, URGENCY_TICK_MS);
    return () => clearInterval(timer);
  }, [deadline, clockOffsetMs]);

  return {
    phase: PHASE_VALUE[phase] ?? 0,
    urgency,
    result: resultRef.current.result,
    resultAt: resultRef.current.at,
  };
}
