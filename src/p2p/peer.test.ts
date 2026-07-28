import { beforeEach, describe, expect, it, vi } from "vitest";

// peer.ts → logger → expo/react-native modules that don't parse in node
vi.mock("expo-file-system", () => ({
  Paths: { cache: "/tmp/" },
  File: vi.fn().mockImplementation(() => ({ uri: "/tmp/test.log", text: "" })),
}));
vi.mock("expo-sharing", () => ({
  shareAsync: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { addPlayer, buildGameState, createRoom } from "@/game/logic";
import { useGameStore } from "@/game/store";
import type { GameState } from "@/game/types";
import { handleHostMessage, resetPeerState, type PeerContext } from "./peer";
import { useP2PStore } from "./store";

function makeState(over: Partial<GameState> = {}): GameState {
  let room = createRoom("TEST01", "host-1", "Alice");
  room = addPlayer(room, "peer-2", "Bob");
  return {
    ...buildGameState(room, { hostNow: Date.now(), stateVersion: 10 }),
    ...over,
  };
}

let fatal: string[];
let initial: number;

function ctx(): PeerContext {
  return {
    myId: "peer-2",
    onInitialState: () => {
      initial++;
    },
    onFatalError: (m) => fatal.push(m),
  };
}

beforeEach(() => {
  useGameStore.getState().reset();
  useP2PStore.getState().reset();
  resetPeerState();
  fatal = [];
  initial = 0;
});

describe("peer — game-state ordering", () => {
  it("applies a fresh state and completes the handshake once", () => {
    handleHostMessage({ type: "game-state", payload: makeState() }, ctx());
    expect(initial).toBe(1);
    expect(useP2PStore.getState().status).toBe("connected");
    expect(useGameStore.getState().roomCode).toBe("TEST01");

    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: 11 }) },
      ctx(),
    );
    expect(initial).toBe(1);
  });

  it("drops a state older than the last applied one", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: 10 }) },
      ctx(),
    );
    handleHostMessage(
      {
        type: "game-state",
        payload: makeState({ stateVersion: 9, roomCode: "STALE1" }),
      },
      ctx(),
    );
    expect(useGameStore.getState().roomCode).toBe("TEST01");
  });

  it("drops a duplicate of the same version", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: 10 }) },
      ctx(),
    );
    handleHostMessage(
      {
        type: "game-state",
        payload: makeState({ stateVersion: 10, roomCode: "DUPE01" }),
      },
      ctx(),
    );
    expect(useGameStore.getState().roomCode).toBe("TEST01");
  });

  it("applies a newer version", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: 10 }) },
      ctx(),
    );
    handleHostMessage(
      {
        type: "game-state",
        payload: makeState({ stateVersion: 11, roomCode: "NEWER1" }),
      },
      ctx(),
    );
    expect(useGameStore.getState().roomCode).toBe("NEWER1");
  });

  it("applies everything when an older host sends no version", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: null }) },
      ctx(),
    );
    handleHostMessage(
      {
        type: "game-state",
        payload: makeState({ stateVersion: null, roomCode: "SECOND" }),
      },
      ctx(),
    );
    expect(useGameStore.getState().roomCode).toBe("SECOND");
  });

  it("accepts a lower version again after a rejoin resets the watermark", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: 500 }) },
      ctx(),
    );
    resetPeerState();
    handleHostMessage(
      {
        type: "game-state",
        payload: makeState({ stateVersion: 3, roomCode: "AFTER1" }),
      },
      ctx(),
    );
    expect(useGameStore.getState().roomCode).toBe("AFTER1");
  });

  it("never lets a stale state clear the reconnecting banner", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: 10 }) },
      ctx(),
    );
    useP2PStore.getState().setResuming("self");
    handleHostMessage(
      { type: "game-state", payload: makeState({ stateVersion: 4 }) },
      ctx(),
    );
    expect(useP2PStore.getState().resuming).toBe("self");
  });
});

describe("peer — host clock offset", () => {
  it("estimates the offset from hostNow", () => {
    const ahead = Date.now() + 300_000;
    handleHostMessage(
      { type: "game-state", payload: makeState({ hostNow: ahead }) },
      ctx(),
    );
    expect(useP2PStore.getState().clockOffsetMs).toBeGreaterThan(299_000);
    expect(useP2PStore.getState().clockOffsetMs).toBeLessThan(301_000);
  });

  it("stays at zero when the host sends no stamp", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ hostNow: null }) },
      ctx(),
    );
    expect(useP2PStore.getState().clockOffsetMs).toBe(0);
  });

  it("ignores a single wildly delayed sample", () => {
    const base = Date.now() + 60_000;
    for (let i = 0; i < 4; i++) {
      handleHostMessage(
        {
          type: "game-state",
          payload: makeState({ hostNow: base, stateVersion: 100 + i }),
        },
        ctx(),
      );
    }
    const steady = useP2PStore.getState().clockOffsetMs;
    handleHostMessage(
      {
        type: "game-state",
        // One sample that hung for 30 s on a bad radio
        payload: makeState({ hostNow: base - 30_000, stateVersion: 200 }),
      },
      ctx(),
    );
    expect(
      Math.abs(useP2PStore.getState().clockOffsetMs - steady),
    ).toBeLessThan(1_000);
  });

  it("does not churn the store for sub-threshold jitter", () => {
    const base = Date.now() + 60_000;
    handleHostMessage(
      { type: "game-state", payload: makeState({ hostNow: base }) },
      ctx(),
    );
    const first = useP2PStore.getState().clockOffsetMs;
    handleHostMessage(
      {
        type: "game-state",
        payload: makeState({ hostNow: base + 50, stateVersion: 11 }),
      },
      ctx(),
    );
    expect(useP2PStore.getState().clockOffsetMs).toBe(first);
  });

  it("clears the offset, the samples and the watermark on reset", () => {
    handleHostMessage(
      { type: "game-state", payload: makeState({ hostNow: Date.now() + 90_000 }) },
      ctx(),
    );
    expect(useP2PStore.getState().clockOffsetMs).not.toBe(0);
    resetPeerState();
    expect(useP2PStore.getState().clockOffsetMs).toBe(0);
  });
});

describe("peer — host errors", () => {
  it("escalates an error when we hold state but no seat", () => {
    const state = makeState();
    handleHostMessage({ type: "game-state", payload: state }, ctx());

    // The host dropped us: our id is gone from the broadcast
    handleHostMessage(
      {
        type: "game-state",
        payload: {
          ...makeState({ stateVersion: 20 }),
          players: state.players.filter((p) => p.id !== "peer-2"),
        },
      },
      ctx(),
    );
    handleHostMessage(
      { type: "error", payload: { message: "That game session expired" } },
      ctx(),
    );
    expect(fatal).toEqual(["That game session expired"]);
  });

  it("keeps an ordinary in-game error as a toast", () => {
    handleHostMessage({ type: "game-state", payload: makeState() }, ctx());
    handleHostMessage(
      { type: "error", payload: { message: "Not your turn" } },
      ctx(),
    );
    expect(fatal).toEqual([]);
    expect(useP2PStore.getState().lastError).toBe("Not your turn");
  });
});
