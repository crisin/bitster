import { useGameStore } from "@/game/store";
import { useP2PStore } from "@/p2p/store";
import { useEffect, useRef } from "react";

/**
 * What the effect layer is allowed to know about the game.
 *
 * Deliberately three numbers and a timestamp, nothing else: the shaders must
 * not grow a dependency on the game model, and the theme layer must not start
 * making decisions about gameplay. This hook is the entire coupling — one
 * direction, one shape.
 *
 * The deadline ships RAW (converted to the local clock) instead of a chewed
 * urgency value: urgency changes every frame, and pumping it through React
 * state meant ~8 re-renders per second for entire countdown windows. The
 * draw loop already owns a per-frame clock — it derives urgency itself
 * (reaction.ts), smoother and for free.
 */
export interface GamePulse {
  /** 0 lobby · 0.25 playing · 0.5 bitster window · 0.75 reveal · 1 finished */
  phase: number;
  /** LOCAL-clock epoch ms the running countdown ends at — null = no clock */
  deadlineAt: number | null;
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

export function useGamePulse(): GamePulse {
  const phase = useGameStore((s) => s.phase);
  const placeDeadline = useGameStore((s) => s.placeDeadline);
  const buzzDeadline = useGameStore((s) => s.buzzDeadline);
  // Deadlines are host-clock absolutes — same offset the countdown pill uses
  const clockOffsetMs = useP2PStore((s) => s.clockOffsetMs);
  const lastResult = useGameStore((s) => s.lastResult);

  const resultRef = useRef({ result: 0, at: 0 });

  // A result is an EVENT, but the store only holds state — remember when it
  // flipped so the flash can decay from there
  const correct = lastResult?.correct;
  useEffect(() => {
    if (correct === undefined) return;
    resultRef.current = { result: correct ? 1 : -1, at: Date.now() };
  }, [correct]);

  const deadline = placeDeadline ?? buzzDeadline;
  return {
    phase: PHASE_VALUE[phase] ?? 0,
    deadlineAt: deadline === null ? null : deadline - clockOffsetMs,
    result: resultRef.current.result,
    resultAt: resultRef.current.at,
  };
}
