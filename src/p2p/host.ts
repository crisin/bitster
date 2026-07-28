import * as logic from "@/game/logic";
import { useGameStore } from "@/game/store";
import type {
  GameStateMeta,
  GuessResult,
  PlacementResult,
  RecapReason,
  Room,
  RoundBuzz,
  RoundGuess,
  RoundOutcome,
  Song,
} from "@/game/types";
import { EMPTY_STATS } from "@/game/types";
import { useHistoryStore } from "@/history/store";
import type { MyPlayer } from "@/history/types";
import { getProvider } from "@/streaming/registry";
import { StreamingFetchError } from "@/streaming/types";
import { useStreamingStore } from "@/streaming/store";
import { log as logger } from "@/utils/logger";
import type { P2PAction } from "./protocol";
import type { HostSnapshot } from "./session";
import { persistSnapshotThrottled, SESSION_TTL_MS } from "./session";
import { useP2PStore } from "./store";

/** Injected by the transport layer — sends to one peer or (default) everyone */
export type SendFn = (action: P2PAction, target?: string) => void;

/** Peers that connect but never complete the join handshake get pruned */
const PLACEHOLDER_TIMEOUT_MS = 10_000;

/**
 * How long a player keeps their seat, timeline and tokens after their socket
 * drops. Long enough for a tunnel, a locked screen or a page reload; short
 * enough that a player who really left doesn't stall the table forever.
 */
const DISCONNECT_GRACE_MS = 60_000;

/**
 * How long the table waits for a disconnected ACTIVE player before their turn
 * is passed on. Only used when no other deadline (blitz, buzz) already governs
 * the phase — otherwise two timers would race for the same decision.
 */
const TURN_GRACE_MS = 20_000;

/** How many playlist slots to try before giving up on finding a fresh song */
const PICK_ATTEMPTS = 5;
/**
 * Retries for a failed REQUEST, separate from the slot budget above. Kept
 * small and flat: the players are staring at a silent screen while this runs.
 */
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_RETRY_MS = 300;

/** Player names are user input from the wire — keep them sane */
const MAX_NAME_LENGTH = 24;

function sanitizeName(raw: string): string {
  const name = raw.trim().slice(0, MAX_NAME_LENGTH).trim();
  if (name.length === 0) throw new Error("Name required");
  return name;
}

/**
 * The host's authoritative game session. Owns the full Room state, validates
 * every incoming action, and broadcasts the resulting GameState. Has no
 * knowledge of the transport — `send` is injected, which keeps it testable.
 */
export class HostSession {
  private room: Room;
  private pendingResult: PlacementResult | null = null;
  private pendingGuessResult: GuessResult | null = null;
  /** Who made the pending guess — their reward is applied at reveal */
  private pendingGuessBy: string | null = null;
  private placeholderTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Per-player countdown from socket loss to actually losing the seat */
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Fallback that moves the turn on when the active player is offline */
  private turnGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private buzzTimer: ReturnType<typeof setTimeout> | null = null;
  /** Blitz mode: countdown for the active player's placement */
  private placeTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while a skip's song swap is in flight — blocks concurrent turn actions */
  private advancing = false;
  /** Gap the buzzer has provisionally selected — auto-locked in on timeout */
  private pendingBuzzPosition: number | null = null;
  /**
   * Stamped on every outgoing game-state, strictly increasing. Seeded from the
   * wall clock rather than 0: a host that restarts (reload → rehydrate) must
   * never re-issue a version a peer has already seen, or that peer would drop
   * the entire new session as stale. Deliberately not persisted for that reason.
   */
  private stateVersion = Date.now();
  /** Gap the active player chose — kept for the round log */
  private pendingPosition: number | null = null;
  /** Raw guess text; pendingGuessResult only holds the verdict */
  private pendingGuessText: {
    title: string;
    artist: string;
    year: number | null;
  } | null = null;
  private gameStartedAt = 0;
  private roundStartedAt = 0;
  /** True once the current round is in the log — blocks double records */
  private roundRecorded = true;
  /** A recap is emitted exactly once per game */
  private recapSent = false;
  /**
   * Why the game ended. Recorded at the transition rather than derived later:
   * a game everyone walked out of can still hold a player at the win score.
   */
  private endedReason: RecapReason | null = null;
  /**
   * The last song pick failed because REQUESTS failed, not because the playlist
   * ran out. Without the distinction a rate limit looks exactly like an empty
   * playlist, and the players get told the wrong thing.
   */
  private fetchFailed = false;
  /** Guards against a second "roll the dice" while one is still collecting */
  private poolBuilding = false;

  constructor(
    private readonly send: SendFn,
    roomCode: string,
    private readonly hostId: string,
    hostName: string,
  ) {
    this.room = logic.createRoom(roomCode, hostId, hostName);
  }

  /** Everything a reloaded host needs to carry on where it left off */
  serialize(): HostSnapshot {
    return {
      v: 1,
      roomCode: this.room.code,
      hostId: this.hostId,
      savedAt: Date.now(),
      room: this.room,
      pendingResult: this.pendingResult,
      pendingGuessResult: this.pendingGuessResult,
      pendingGuessBy: this.pendingGuessBy,
      pendingBuzzPosition: this.pendingBuzzPosition,
      pendingPosition: this.pendingPosition,
      pendingGuessText: this.pendingGuessText,
      gameStartedAt: this.gameStartedAt,
      roundStartedAt: this.roundStartedAt,
      roundRecorded: this.roundRecorded,
      recapSent: this.recapSent,
    };
  }

  /**
   * Rebuild a session from a snapshot after a reload. Returns null for anything
   * that isn't demonstrably OUR room — a mismatched snapshot must never be
   * silently adopted, or the host plants a foreign game under a live room code.
   */
  static restore(
    send: SendFn,
    snapshot: HostSnapshot,
    expect: { roomCode: string; hostId: string },
  ): HostSession | null {
    if (snapshot.v !== 1) return null;
    if (snapshot.roomCode !== expect.roomCode) return null;
    if (snapshot.hostId !== expect.hostId) return null;
    if (Date.now() - snapshot.savedAt > SESSION_TTL_MS) return null;

    const session = new HostSession(
      send,
      snapshot.roomCode,
      snapshot.hostId,
      "",
    );
    session.hydrate(snapshot);
    return session;
  }

  private hydrate(snapshot: HostSnapshot): void {
    this.room = snapshot.room;
    this.pendingResult = snapshot.pendingResult;
    this.pendingGuessResult = snapshot.pendingGuessResult;
    this.pendingGuessBy = snapshot.pendingGuessBy;
    this.pendingBuzzPosition = snapshot.pendingBuzzPosition;
    this.pendingPosition = snapshot.pendingPosition;
    this.pendingGuessText = snapshot.pendingGuessText;
    this.gameStartedAt = snapshot.gameStartedAt;
    this.roundStartedAt = snapshot.roundStartedAt;
    this.roundRecorded = snapshot.roundRecorded;
    this.recapSent = snapshot.recapSent;
    // Whatever await was in flight died with the page
    this.advancing = false;
    this.rearmTimers();
  }

  /**
   * Put the clocks back. Every deadline is absolute, so a timer that expired
   * while the page was gone fires on the next macrotask (Math.max(0, …)) rather
   * than being lost. Every handler re-checks its preconditions, which is what
   * makes a late fire safe — keep that invariant for any new handler.
   */
  private rearmTimers(): void {
    const { phase, buzzerId, buzzDeadline, placeDeadline } = this.room;

    if (phase === "bitster-window" && buzzerId && buzzDeadline !== null) {
      this.clearBuzzTimer();
      this.buzzTimer = setTimeout(
        () => this.handleBuzzTimeout(),
        Math.max(0, buzzDeadline - Date.now()),
      );
    }
    if (phase === "playing" && placeDeadline !== null) {
      this.clearPlaceTimer();
      this.placeTimer = setTimeout(
        () => this.handlePlaceTimeout(),
        Math.max(0, placeDeadline - Date.now()),
      );
    }
    for (const player of this.room.players) {
      if (player.connected || player.disconnectedUntil === null) continue;
      this.clearDisconnectTimer(player.id);
      this.disconnectTimers.set(
        player.id,
        setTimeout(
          () => this.dropPlayer(player.id),
          Math.max(0, player.disconnectedUntil - Date.now()),
        ),
      );
    }
    this.maybeArmTurnGrace();
  }

  /**
   * The relay tells a resuming host who is actually still in the room. Absence
   * is authoritative ("gone"), presence is not ("alive as of the last ping") —
   * an action arriving from a player is what really proves they are there.
   */
  reconcileMembers(memberIds: string[] | undefined): void {
    // An older server (or a rolling deploy) sends no list. Marking the whole
    // room offline on a guess would be catastrophic — do nothing instead.
    if (!memberIds || memberIds.length === 0) return;
    const present = new Set(memberIds);

    for (const player of this.room.players) {
      if (player.isLocal || player.id === this.room.hostId) continue;
      if (present.has(player.id)) {
        if (!player.connected) {
          this.clearDisconnectTimer(player.id);
          this.room = logic.setPlayerConnected(this.room, player.id, true, null);
        }
      } else if (player.connected) {
        const until = Date.now() + DISCONNECT_GRACE_MS;
        this.room = logic.setPlayerConnected(this.room, player.id, false, until);
        this.clearDisconnectTimer(player.id);
        this.disconnectTimers.set(
          player.id,
          setTimeout(() => this.dropPlayer(player.id), DISCONNECT_GRACE_MS),
        );
      }
    }

    const store = useP2PStore.getState();
    store.setPeers(
      this.room.players
        .filter((p) => p.id !== this.room.hostId && !p.isLocal)
        .map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
    );
  }

  destroy(): void {
    for (const timer of this.placeholderTimers.values()) {
      clearTimeout(timer);
    }
    this.placeholderTimers.clear();
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
    this.clearTurnGrace();
    this.clearBuzzTimer();
    this.clearPlaceTimer();
  }

  /** A peer's socket connected — track it and show them the room is alive */
  handlePeerConnected(peerId: string): void {
    // A seat we already know: this is a reconnect, not a new player. Cancel the
    // grace, put them back online and re-broadcast — their `join` action that
    // follows only refreshes the name.
    if (this.room.players.some((p) => p.id === peerId)) {
      this.clearDisconnectTimer(peerId);
      this.room = logic.setPlayerConnected(this.room, peerId, true, null);
      this.clearTurnGrace();
      useP2PStore.getState().addPeer({
        id: peerId,
        name: this.room.players.find((p) => p.id === peerId)?.name ?? "",
        connected: true,
      });
      logger.info("p2p", `Peer ${peerId.slice(0, 8)} resumed their seat`);
      this.broadcastState();
      return;
    }

    // An unknown id can no longer take a seat once the game is running — say so
    // instead of leaving them as a ghost with no player entry.
    if (this.room.phase !== "lobby") {
      this.sendError(
        this.room.phase === "finished"
          ? "That game is already over."
          : "That game session expired — the round moved on without you.",
        peerId,
      );
      return;
    }

    useP2PStore.getState().addPeer({ id: peerId, name: "", connected: true });
    this.send(
      {
        type: "game-state",
        payload: logic.buildGameState(this.room, this.nextStateMeta()),
      },
      peerId,
    );

    // If they never send a join (validation failure, client bug), drop the
    // empty placeholder entry instead of letting it linger forever
    this.clearPlaceholderTimer(peerId);
    this.placeholderTimers.set(
      peerId,
      setTimeout(() => {
        const peer = useP2PStore.getState().peers.find((p) => p.id === peerId);
        if (peer && peer.name === "") {
          logger.warn(
            "p2p",
            `Pruning peer ${peerId.slice(0, 8)} — never joined`,
          );
          useP2PStore.getState().removePeer(peerId);
        }
        this.placeholderTimers.delete(peerId);
      }, PLACEHOLDER_TIMEOUT_MS),
    );
  }

  /**
   * A peer's socket dropped. That is NOT the same as leaving: their seat,
   * timeline and tokens survive until the disconnect grace expires, so a locked
   * screen, a tunnel or a page reload no longer costs a player their game.
   */
  handlePeerDisconnected(peerId: string): void {
    this.clearPlaceholderTimer(peerId);

    const player = this.room.players.find((p) => p.id === peerId);
    if (!player) {
      // Connected but never completed the handshake — nothing to protect
      useP2PStore.getState().removePeer(peerId);
      return;
    }

    if (this.room.phase === "lobby") {
      // No timeline at stake, and a ghost would eat a maxPlayers slot
      this.dropPlayer(peerId);
      return;
    }

    if (this.room.phase === "finished") {
      // Scoreboard and awards must keep them — never drop after the game
      this.room = logic.setPlayerConnected(this.room, peerId, false, null);
      useP2PStore.getState().updatePeer(peerId, { connected: false });
      this.broadcastState();
      return;
    }

    const until = Date.now() + DISCONNECT_GRACE_MS;
    this.room = logic.setPlayerConnected(this.room, peerId, false, until);
    useP2PStore.getState().updatePeer(peerId, { connected: false });
    this.clearDisconnectTimer(peerId);
    this.disconnectTimers.set(
      peerId,
      setTimeout(() => this.dropPlayer(peerId), DISCONNECT_GRACE_MS),
    );
    logger.info(
      "p2p",
      `Peer ${peerId.slice(0, 8)} dropped — holding their seat for ${DISCONNECT_GRACE_MS / 1000}s`,
    );

    // Nobody left who could challenge: without this the window hangs, because
    // allChallengersPassed stays false as long as nobody has passed.
    if (
      this.room.phase === "bitster-window" &&
      !this.room.buzzerId &&
      !logic.hasLiveChallengers(this.room)
    ) {
      this.doRevealSong(null);
      return;
    }

    this.broadcastState();
  }

  /** The grace expired (or they were never protected) — the seat is gone. */
  private dropPlayer(peerId: string): void {
    // A skip's song swap is in flight. Retry in a tick instead of racing it —
    // this used to fire straight off a socket close, it now fires off a timer,
    // which makes landing inside the swap far more likely.
    if (this.advancing) {
      this.disconnectTimers.set(
        peerId,
        setTimeout(() => this.dropPlayer(peerId), 50),
      );
      return;
    }

    this.clearDisconnectTimer(peerId);
    this.clearPlaceholderTimer(peerId);
    useP2PStore.getState().removePeer(peerId);
    if (!this.room.players.some((p) => p.id === peerId)) return;

    const activeBefore = logic.getCurrentPlayer(this.room);
    const songBefore = this.room.currentSong;
    const wasCurrentPlayer = activeBefore?.id === peerId;
    const wasBuzzer = this.room.buzzerId === peerId;

    // Their tentative placement leaves with them; removePlayer discards the
    // whole timeline anyway, so there is nothing to undo first.
    if (wasCurrentPlayer && this.room.phase === "bitster-window") {
      this.pendingResult = null;
      this.pendingPosition = null;
    }

    this.room = logic.removePlayer(this.room, peerId);

    if (wasBuzzer) {
      this.clearBuzzTimer();
      this.room = { ...this.room, buzzerId: null, buzzDeadline: null };
    }

    // Not enough players to continue
    if (this.room.players.length < 2 && this.room.phase !== "lobby") {
      this.recordAbandonedRound(activeBefore, songBefore);
      this.finishGame("abandoned");
      this.pendingResult = null;
      this.broadcastState();
      return;
    }

    // Auto-advance if the current player was dropped mid-turn
    if (
      wasCurrentPlayer &&
      (this.room.phase === "playing" ||
        this.room.phase === "reveal" ||
        this.room.phase === "bitster-window")
    ) {
      // Their pending guess and placement countdown leave with them
      this.recordAbandonedRound(activeBefore, songBefore);
      this.clearPendingGuess();
      this.clearPlaceTimer();
      this.clearTurnGrace();
      this.room = logic.advanceTurn(this.room);
      this.advancing = true;
      void this.pickAndPlayNextSong().then(
        (picked) => {
          if (!picked) this.finishNoSong();
          this.advancing = false;
          this.broadcastState();
        },
        (err) => {
          logger.error("p2p", `Auto-advance after a drop failed: ${err}`);
          this.advancing = false;
          this.broadcastState();
        },
      );
      return;
    }

    // The departure may have satisfied the "everyone passed" condition
    if (
      this.room.phase === "bitster-window" &&
      logic.allChallengersPassed(this.room)
    ) {
      this.doRevealSong(null);
      return;
    }

    this.broadcastState();
  }

  private clearDisconnectTimer(peerId: string): void {
    const timer = this.disconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(peerId);
    }
  }

  /**
   * Hold the table for a disconnected active player, but only when no other
   * deadline already governs the phase — a blitz countdown or a running buzz
   * resolves the round on its own, and two timers would race for one decision.
   */
  private maybeArmTurnGrace(): void {
    this.clearTurnGrace();
    const current = logic.getCurrentPlayer(this.room);
    if (!current || current.connected) return;
    if (this.room.phase === "playing") {
      if (this.room.placeDeadline !== null) return;
    } else if (this.room.phase === "bitster-window") {
      if (this.room.buzzerId !== null) return;
    } else {
      return;
    }
    this.turnGraceTimer = setTimeout(
      () => this.handleTurnGraceTimeout(),
      TURN_GRACE_MS,
    );
  }

  /** The offline active player didn't come back — move the game on. */
  private handleTurnGraceTimeout(): void {
    this.turnGraceTimer = null;
    const current = logic.getCurrentPlayer(this.room);
    if (!current || current.connected) return;

    if (this.room.phase === "bitster-window") {
      // They did place — judge it as it stands rather than punishing them
      logger.info("p2p", "Turn grace expired — revealing without the buzzers");
      this.doRevealSong(null);
      return;
    }
    if (this.room.phase !== "playing") return;

    logger.info("p2p", "Turn grace expired — passing the turn on");
    this.recordAbandonedRound(current, this.room.currentSong);
    this.clearPendingGuess();
    this.clearPlaceTimer();
    this.room = logic.advanceTurn(this.room);
    this.advancing = true;
    void this.pickAndPlayNextSong().then(
      (picked) => {
        if (!picked) this.finishNoSong();
        this.advancing = false;
        this.broadcastState();
      },
      (err) => {
        logger.error("p2p", `Turn-grace advance failed: ${err}`);
        this.advancing = false;
        this.broadcastState();
      },
    );
  }

  private clearTurnGrace(): void {
    if (this.turnGraceTimer) {
      clearTimeout(this.turnGraceTimer);
      this.turnGraceTimer = null;
    }
  }

  async handleAction(action: P2PAction, fromPeerId: string): Promise<void> {
    // An action arriving proves the socket is alive, so any presence mistake
    // heals itself here. Local players have no socket and are never offline.
    const sender = this.room.players.find((p) => p.id === fromPeerId);
    if (sender && !sender.connected && !sender.isLocal) {
      this.clearDisconnectTimer(fromPeerId);
      this.room = logic.setPlayerConnected(this.room, fromPeerId, true, null);
    }

    try {
      switch (action.type) {
        case "join": {
          this.clearPlaceholderTimer(fromPeerId);
          const joinName = sanitizeName(action.payload.name);
          this.room = logic.addPlayer(this.room, fromPeerId, joinName);
          useP2PStore.getState().updatePeer(fromPeerId, { name: joinName });
          this.broadcastState();
          break;
        }

        case "add-local-player": {
          // Pass-and-play: extra players on the host's device. Only the host
          // may manage them (online peers play on their own connection).
          if (fromPeerId !== this.room.hostId) return;
          const localId = `local-${Math.random().toString(36).slice(2, 10)}`;
          this.room = logic.addPlayer(
            this.room,
            localId,
            sanitizeName(action.payload.name),
            true,
          );
          this.broadcastState();
          break;
        }

        case "remove-local-player": {
          if (fromPeerId !== this.room.hostId) return;
          if (this.room.phase !== "lobby") return;
          const target = this.room.players.find(
            (p) => p.id === action.payload.playerId,
          );
          if (!target?.isLocal) return;
          this.room = logic.removePlayer(this.room, target.id);
          this.broadcastState();
          break;
        }

        case "start-game": {
          if (fromPeerId !== this.room.hostId) return;
          this.clearPendingGuess();
          this.gameStartedAt = Date.now();
          this.recapSent = false;

          // A collected random pool is played straight out of memory — there
          // is no single playlist to walk by index.
          if (this.room.songSource === "random" && this.room.playlist.length) {
            const pool = this.room.playlist;
            this.room = logic.startGame(
              this.room,
              pool,
              this.room.playlistName ?? "Random Mix",
            );
            this.room = {
              ...this.room,
              songSource: "random",
              playlistTrackCount: pool.length,
            };
            const rolled = await this.pickAndPlayNextSong();
            if (!rolled) this.finishNoSong();
            this.broadcastState();
            break;
          }
          // Prefer the playlist already checked in the lobby; fall back to
          // resolving the URL in the payload (older clients / direct start)
          const stored = this.room.playlistId
            ? {
                playlistId: this.room.playlistId,
                name: this.room.playlistName ?? "Playlist",
                trackCount: this.room.playlistTrackCount,
                imageUrl: this.room.playlistImageUrl,
              }
            : null;
          const meta =
            stored ?? (await this.resolvePlaylist(action.payload.playlistUrl));
          // A playlist link that was entered but can't be resolved is refused —
          // silently swapping it for the demo list would be confusing. With NO
          // link entered, the demo fallback below is a deliberate choice
          // (pass-and-play without music, dev/testing).
          if (!meta && action.payload.playlistUrl.trim() !== "") {
            this.sendError(
              "Couldn't load that playlist — fix the link, or clear it to play the demo game",
              fromPeerId,
            );
            return;
          }
          if (meta) {
            // Lazy loading — only fetch meta, songs loaded on demand
            this.room = logic.startGame(
              this.room,
              [],
              meta.name,
              meta.playlistId,
              meta.trackCount,
            );
            this.room = {
              ...this.room,
              playlistImageUrl: meta.imageUrl,
              songSource: "playlist",
            };
          } else {
            // No provider or URL — fallback to mock
            this.room = logic.startGame(
              this.room,
              getMockPlaylist(),
              "Demo Playlist",
            );
            this.room = {
              ...this.room,
              playlistImageUrl: null,
              songSource: "demo",
            };
          }
          const picked = await this.pickAndPlayNextSong();
          if (!picked) this.finishNoSong();
          this.broadcastState();
          break;
        }

        case "place-song": {
          if (this.room.phase !== "playing" || this.advancing) return;
          if (this.room.buzzerId) {
            this.sendError("Wait for buzzer to place", fromPeerId);
            return;
          }
          const current = logic.getCurrentPlayer(this.room);
          if (current?.id !== fromPeerId) {
            this.sendError("Not your turn", fromPeerId);
            return;
          }
          this.clearPlaceTimer();
          const { room: updated, result } = logic.placeSong(
            this.room,
            fromPeerId,
            action.payload.position,
          );
          this.room = updated;
          this.pendingPosition = action.payload.position;
          // Store result for reveal — don't broadcast yet (year hidden during bitster-window)
          this.pendingResult = result;

          // Their very first card cannot be placed wrong, so the challenge
          // window would be a dead step that only costs somebody a token.
          if (!logic.canBeChallenged(this.room)) {
            this.doRevealSong(null);
            break;
          }

          this.broadcastState();
          break;
        }

        case "guess-song": {
          // Active player guesses BEFORE placing (during playing phase)
          if (this.advancing) return;
          if (this.room.phase !== "playing") {
            logger.warn(
              "p2p",
              `guess-song rejected: phase is "${this.room.phase}"`,
            );
            return;
          }
          const currentForGuess = logic.getCurrentPlayer(this.room);
          if (fromPeerId !== currentForGuess?.id) {
            this.sendError("Only the active player can guess", fromPeerId);
            return;
          }
          // One guess per song — otherwise correct answers could be
          // brute-forced against the fuzzy matcher
          if (this.pendingGuessResult) {
            this.sendError("Already guessed this round", fromPeerId);
            return;
          }
          const guessResult = logic.evaluateGuess(
            this.room,
            action.payload.title,
            action.payload.artist,
            action.payload.year,
          );
          logger.debug(
            "p2p",
            `guess result: title=${guessResult.titleCorrect}, artist=${guessResult.artistCorrect}, year=${guessResult.yearCorrect}`,
          );
          // Store result — feedback AND token reward land at reveal, so the
          // broadcast token count can't leak the verdict early
          this.pendingGuessResult = guessResult;
          this.pendingGuessBy = fromPeerId;
          this.pendingGuessText = {
            title: action.payload.title,
            artist: action.payload.artist,
            year: action.payload.year ?? null,
          };
          this.broadcastState();
          break;
        }

        case "skip-song": {
          // `advancing` blocks the re-entrancy race: without it a second skip
          // (or a place-song) arriving during the song swap would act on the
          // fresh song and double-spend tokens
          if (this.room.phase !== "playing" || this.advancing) return;
          if (!this.room.currentSong) return;
          const currentForSkip = logic.getCurrentPlayer(this.room);
          if (fromPeerId !== currentForSkip?.id) return;
          this.room = logic.skipSong(this.room, fromPeerId);
          // Log before the round's state is wiped. A skip discards the guess
          // reward, so it goes into the log with 0 tokens.
          this.recordRound({
            outcome: "skipped",
            position: null,
            correct: null,
            buzz: null,
          });
          this.clearPendingGuess();
          this.clearPlaceTimer();
          this.room = { ...this.room, currentSong: null, placeDeadline: null };
          this.advancing = true;
          try {
            const skipPicked = await this.pickAndPlayNextSong();
            if (!skipPicked) this.finishNoSong();
          } finally {
            this.advancing = false;
          }
          this.broadcastState();
          break;
        }

        case "next-round": {
          if (this.room.phase !== "reveal") return;
          const currentForNext = logic.getCurrentPlayer(this.room);
          if (
            fromPeerId !== currentForNext?.id &&
            fromPeerId !== this.room.hostId
          )
            return;
          this.clearPendingGuess();
          const winner = logic.checkWinCondition(this.room);
          if (winner) {
            this.finishGame("win");
            this.broadcastState();
          } else {
            this.room = logic.advanceTurn(this.room);
            const nextPicked = await this.pickAndPlayNextSong();
            if (!nextPicked) this.finishNoSong();
            this.broadcastState();
          }
          break;
        }

        case "bitster-buzz": {
          // Other players can bitster during bitster-window (before year is revealed)
          if (this.room.phase !== "bitster-window") return;
          const buzzed = logic.handleBuzz(this.room, fromPeerId);
          if (
            buzzed.buzzerId === fromPeerId &&
            this.room.buzzerId !== fromPeerId
          ) {
            // Buzz accepted — start the lock-in countdown
            const timerMs = buzzed.settings.rules.buzz.timerSeconds * 1000;
            this.room = { ...buzzed, buzzDeadline: Date.now() + timerMs };
            this.pendingBuzzPosition = null;
            this.clearBuzzTimer();
            this.buzzTimer = setTimeout(
              () => this.handleBuzzTimeout(),
              timerMs,
            );
          } else {
            this.room = buzzed;
          }
          this.broadcastState();
          break;
        }

        case "bitster-pass": {
          if (this.room.phase !== "bitster-window") return;
          const passed = logic.recordPass(this.room, fromPeerId);
          if (passed === this.room) return;
          this.room = passed;
          if (logic.allChallengersPassed(this.room)) {
            // Everyone waved it through — straight to the reveal
            this.doRevealSong(null);
          } else {
            this.broadcastState();
          }
          break;
        }

        case "buzz-select": {
          // Buzzer picked a gap (not yet confirmed) — locked in on timeout
          if (this.room.phase !== "bitster-window") return;
          if (this.room.buzzerId !== fromPeerId) return;
          // Valid gaps refer to the active player's timeline WITHOUT the
          // disputed card (it is removed before the buzz resolves)
          const challengeGaps = Math.max(
            0,
            (logic.getCurrentPlayer(this.room)?.timeline.length ?? 0) - 1,
          );
          if (action.payload.position > challengeGaps) {
            this.sendError("Invalid placement", fromPeerId);
            return;
          }
          this.pendingBuzzPosition = action.payload.position;
          break;
        }

        case "buzz-place": {
          if (this.room.phase !== "bitster-window") return;
          if (this.room.buzzerId !== fromPeerId) {
            this.sendError("You don't have the buzz", fromPeerId);
            return;
          }
          // Buzzer placed — auto-trigger reveal with their position
          this.doRevealSong(action.payload.position);
          break;
        }

        case "reveal-song": {
          if (this.room.phase !== "bitster-window") return;
          if (this.room.buzzerId) {
            this.sendError("A bitster challenge is running", fromPeerId);
            return;
          }
          const currentForReveal = logic.getCurrentPlayer(this.room);
          if (
            fromPeerId !== currentForReveal?.id &&
            fromPeerId !== this.room.hostId
          )
            return;
          this.doRevealSong(null);
          break;
        }

        case "set-playlist": {
          // Host checked a playlist URL in the lobby — resolve + share with everyone
          if (fromPeerId !== this.room.hostId) return;
          if (this.room.phase !== "lobby") return;
          const url = action.payload.playlistUrl.trim();
          const playlistMeta = url ? await this.resolvePlaylist(url) : null;
          void this.probePlaylist(playlistMeta?.playlistId ?? null);
          this.room = playlistMeta
            ? {
                ...this.room,
                playlistName: playlistMeta.name,
                playlistImageUrl: playlistMeta.imageUrl,
                playlistId: playlistMeta.playlistId,
                playlistUrl: playlistMeta.url,
                playlistTrackCount: playlistMeta.trackCount,
                songSource: "playlist",
                // A pasted link replaces any pool that was collected before
                playlist: [],
              }
            : {
                ...this.room,
                playlistName: null,
                playlistImageUrl: null,
                playlistId: null,
                playlistUrl: null,
                playlistTrackCount: 0,
                songSource: "demo",
                playlist: [],
              };
          this.broadcastState();
          break;
        }

        case "set-random-pool": {
          if (fromPeerId !== this.room.hostId) return;
          if (this.room.phase !== "lobby") return;
          if (this.poolBuilding) return;

          const providerId = useStreamingStore.getState().activeProviderId;
          const provider = providerId ? getProvider(providerId) : null;
          if (!provider?.library.buildRandomPool) {
            this.sendError(
              "Random songs need a connected streaming account.",
              fromPeerId,
            );
            return;
          }

          this.poolBuilding = true;
          useP2PStore
            .getState()
            .setHostTask({ label: "Collecting songs", done: 0, total: action.payload.target });
          try {
            const pool = await provider.library.buildRandomPool({
              target: action.payload.target,
              onProgress: (done, total) =>
                useP2PStore
                  .getState()
                  .setHostTask({ label: "Collecting songs", done, total }),
            });
            if (pool.length === 0) {
              this.sendError(
                "Found no playable songs in your own playlists — paste a playlist link instead.",
                fromPeerId,
              );
              this.room = { ...this.room, songSource: "demo" };
            } else {
              this.room = {
                ...this.room,
                playlist: pool,
                // No playlistId: a pool is played from memory, not by index
                playlistId: null,
                playlistName: "🎲 Random Mix",
                playlistImageUrl: null,
                // A pool has no single playlist behind it to link to
                playlistUrl: null,
                playlistTrackCount: pool.length,
                songSource: "random",
              };
            }
          } catch (err) {
            logger.error("p2p", `Random pool failed: ${err}`);
            this.sendError("Couldn't collect random songs from Spotify.", fromPeerId);
          } finally {
            this.poolBuilding = false;
            useP2PStore.getState().setHostTask(null);
          }
          this.broadcastState();
          break;
        }

        case "update-settings": {
          if (fromPeerId !== this.room.hostId) return;
          // Mid-game rule changes would silently shift win conditions and
          // armed timers — settings are a lobby thing
          if (this.room.phase !== "lobby") {
            this.sendError("Settings can only be changed in the lobby", fromPeerId);
            return;
          }
          this.room = {
            ...this.room,
            settings: { ...this.room.settings, ...action.payload },
          };
          this.broadcastState();
          break;
        }

        case "rematch": {
          if (fromPeerId !== this.room.hostId) return;
          // Restarting mid-game must not make that game vanish from history
          if (this.room.phase !== "lobby") this.finalizeGame("abandoned");
          this.clearPendingGuess();
          this.pendingResult = null;
          this.pendingPosition = null;
          this.clearBuzzTimer();
          this.clearPlaceTimer();
          this.clearTurnGrace();
          this.pendingBuzzPosition = null;
          this.recapSent = false;
          this.endedReason = null;
          this.gameStartedAt = 0;
          this.roundStartedAt = 0;
          this.roundRecorded = true;
          this.room = {
            ...this.room,
            phase: "lobby",
            playedSongs: [],
            playedIndices: [],
            rounds: [],
            currentSong: null,
            currentPlayerIndex: 0,
            buzzerId: null,
            buzzDeadline: null,
            placeDeadline: null,
            passedIds: [],
            players: this.room.players.map((p) => ({
              ...p,
              score: 0,
              timeline: [],
              tokens: 2,
              failedSongs: [],
              penalties: 0,
              stats: { ...EMPTY_STATS },
            })),
          };
          this.broadcastState();
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("p2p", `Action error: ${message}`);
      if (fromPeerId !== this.hostId) {
        this.sendError(message, fromPeerId);
      }
    }
  }

  broadcastState(lastResult?: PlacementResult): void {
    const state = logic.buildGameState(this.room, this.nextStateMeta());
    if (lastResult) state.lastResult = lastResult;
    // Include guess result during bitster-window and reveal phases
    if (
      this.pendingGuessResult &&
      (this.room.phase === "bitster-window" || this.room.phase === "reveal")
    ) {
      state.guessResult = this.pendingGuessResult;
    }

    useGameStore.getState().applyGameState(state);
    this.send({ type: "game-state", payload: state });

    // Single choke point for every state change — no path can forget to
    // re-evaluate whether the table is waiting on an offline player, or to
    // persist the state a reload would otherwise take down with it.
    try {
      this.maybeArmTurnGrace();
    } catch (err) {
      logger.error("p2p", `Turn-grace arming failed: ${err}`);
    }
    // The recap can never be sent before the game is over, and every path into
    // "finished" ends in a broadcast, so it can never be missed either. Must
    // run BEFORE the snapshot, or a reloaded host would re-emit it.
    if (this.room.phase === "finished") {
      this.finalizeGame(this.endedReason ?? "abandoned");
    }
    try {
      persistSnapshotThrottled(this.serialize());
    } catch (err) {
      logger.warn("p2p", `Snapshot persist failed: ${err}`);
    }
  }

  private sendError(message: string, target: string): void {
    // An error aimed at the host's own device — or at one of its pass-and-play
    // players — has no socket to travel to: it would go out over the relay and
    // come back into a handler that ignores "error" actions, so nobody would
    // ever see it. Write it straight to the store the banner reads from.
    const player = this.room.players.find((p) => p.id === target);
    if (target === this.hostId || player?.isLocal) {
      useP2PStore.getState().setLastError(message);
      return;
    }
    this.send({ type: "error", payload: { message } }, target);
  }

  /**
   * Metadata for exactly one outgoing state. Every message gets a fresh
   * version — including the targeted resync in handlePeerConnected — so
   * "same version, two different payloads" can never happen; peers only
   * need monotonicity to drop stale broadcasts.
   */
  private nextStateMeta(): GameStateMeta {
    this.stateVersion += 1;
    return { hostNow: Date.now(), stateVersion: this.stateVersion };
  }

  private clearPlaceholderTimer(peerId: string): void {
    const timer = this.placeholderTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.placeholderTimers.delete(peerId);
    }
  }

  /**
   * Resolves the bitster-window: checks active player's placement,
   * handles buzz resolution, transitions to reveal phase.
   */
  private doRevealSong(buzzPosition: number | null): void {
    if (!this.pendingResult) return;
    this.clearBuzzTimer();
    this.pendingBuzzPosition = null;

    const currentPlayer = logic.getCurrentPlayer(this.room);

    // Snapshot everything the round log needs BEFORE the resolution rewrites it
    const loggedSong = this.pendingResult.song;
    const activeId = currentPlayer?.id ?? "";
    const activeName = currentPlayer?.name ?? "";
    const placedCorrect = this.pendingResult.correct;
    const loggedBuzzerId = this.room.buzzerId;
    const loggedBuzzer = loggedBuzzerId
      ? this.room.players.find((p) => p.id === loggedBuzzerId)
      : undefined;
    const buzzerTimelineBefore = loggedBuzzer?.timeline.length ?? 0;
    const buzzerPenaltiesBefore = loggedBuzzer?.penalties ?? 0;

    // Placement stats — the verdict is final now
    if (currentPlayer) {
      this.room = logic.bumpStat(
        this.room,
        currentPlayer.id,
        this.pendingResult.correct ? "placedCorrect" : "placedWrong",
      );
    }

    // If active player was wrong, remove the tentatively placed card
    if (!this.pendingResult.correct && currentPlayer) {
      this.room = logic.undoPlacement(
        this.room,
        currentPlayer.id,
        this.pendingResult.song.id,
      );
    }

    // Handle buzz resolution
    const buzzerId = this.room.buzzerId;
    if (buzzerId && buzzPosition === null) {
      // Buzz forfeited (timeout without a pick) — token gone, counts as a fail
      this.room = logic.bumpStat(this.room, buzzerId, "buzzFails");
    }
    if (buzzerId && buzzPosition !== null) {
      if (this.pendingResult.correct) {
        // Active player was right — buzzer challenged incorrectly (token already spent)
        this.room = logic.bumpStat(this.room, buzzerId, "buzzFails");
        this.room = { ...this.room, buzzerId: null };
      } else {
        // Active player wrong — resolve buzzer's placement
        try {
          const { room: buzzRoom } = logic.resolveBuzz(this.room, buzzPosition);
          this.room = buzzRoom;
        } catch (err) {
          // Invalid position (e.g. stale provisional pick) — buzz forfeits
          logger.warn("p2p", `Buzz resolution failed: ${err}`);
          this.room = logic.bumpStat(this.room, buzzerId, "buzzFails");
          this.room = { ...this.room, buzzerId: null };
        }
      }
    }

    const guessTokens = this.applyGuessReward();

    // Whether the steal actually landed is derived from the buzzer's timeline
    // growing, not from the inputs: resolveBuzz can throw, and the catch above
    // downgrades the buzz to a plain fail.
    const buzzerAfter = loggedBuzzerId
      ? this.room.players.find((p) => p.id === loggedBuzzerId)
      : undefined;
    const stolen =
      loggedBuzzerId !== null &&
      (buzzerAfter?.timeline.length ?? 0) > buzzerTimelineBefore;
    const penalty =
      loggedBuzzerId !== null &&
      (buzzerAfter?.penalties ?? 0) > buzzerPenaltiesBefore;

    this.recordRound(
      {
        outcome: "placed",
        position: this.pendingPosition,
        correct: placedCorrect,
        buzz: loggedBuzzerId
          ? {
              playerId: loggedBuzzerId,
              playerName: loggedBuzzer?.name ?? "",
              position: buzzPosition,
              stolen,
              penalty,
            }
          : null,
        guessTokens,
      },
      { song: loggedSong, activeId, activeName },
    );

    // Who actually keeps the card — the buzzer who stole it, the active player
    // who placed it right, or nobody at all.
    const awardedTo = stolen
      ? loggedBuzzerId
      : placedCorrect && activeId
        ? activeId
        : null;
    this.pendingResult = { ...this.pendingResult, awardedTo };

    // Transition to reveal
    this.room = {
      ...this.room,
      phase: "reveal",
      buzzerId: null,
      buzzDeadline: null,
    };
    this.broadcastState(this.pendingResult);
    this.pendingResult = null;
    this.pendingPosition = null;
  }

  /**
   * Write one finished round to the log. Guarded by `roundRecorded`, which is
   * what keeps a round from being logged twice (reveal followed by a
   * disconnect) or lost entirely.
   */
  private recordRound(
    part: {
      outcome: RoundOutcome;
      position: number | null;
      correct: boolean | null;
      buzz: RoundBuzz | null;
      guessTokens?: number;
    },
    override?: { song: Song; activeId: string; activeName: string },
  ): void {
    if (this.roundRecorded) return;
    const song = override?.song ?? this.room.currentSong;
    if (!song) return;

    const current = logic.getCurrentPlayer(this.room);
    const activeId = override?.activeId ?? current?.id ?? "";
    const activeName = override?.activeName ?? current?.name ?? "";
    if (!activeId) return;

    // Only log the guess against the player who actually made it — a
    // disconnect can reshuffle the turn between guess and record.
    const guess: RoundGuess | null =
      this.pendingGuessResult &&
      this.pendingGuessText &&
      this.pendingGuessBy === activeId
        ? {
            title: this.pendingGuessText.title,
            artist: this.pendingGuessText.artist,
            year: this.pendingGuessText.year,
            titleCorrect: this.pendingGuessResult.titleCorrect,
            artistCorrect: this.pendingGuessResult.artistCorrect,
            yearCorrect: this.pendingGuessResult.yearCorrect,
            tokens: part.guessTokens ?? 0,
          }
        : null;

    this.room = logic.appendRound(this.room, {
      song,
      activePlayerId: activeId,
      activePlayerName: activeName,
      outcome: part.outcome,
      position: part.position,
      correct: part.correct,
      placeMs: this.roundStartedAt > 0 ? Date.now() - this.roundStartedAt : null,
      guess,
      buzz: part.buzz,
    });
    this.roundRecorded = true;
  }

  /**
   * Build and hand out the recap, exactly once per game. The reason is passed
   * in because only the caller knows why the game ended — a game abandoned by
   * everyone can still hold a player at the win score.
   */
  private finalizeGame(reason: RecapReason): void {
    if (this.recapSent) return;
    this.recapSent = true;
    try {
      const recap = logic.buildGameRecap(this.room, {
        startedAt: this.gameStartedAt || Date.now(),
        endedAt: Date.now(),
        endedReason: reason,
        demo: this.room.songSource === "demo",
      });
      // Our own copy is filed locally; the peers file theirs when it arrives
      useHistoryStore.getState().recordGame(recap, this.myPlayers());
      this.send({ type: "game-recap", payload: recap });
      logger.info("p2p", `Game finished (${reason}) — recap sent`);
    } catch (err) {
      logger.error("p2p", `Could not build the recap: ${err}`);
    }
  }

  /** The host device plays for itself plus every pass-and-play player on it */
  private myPlayers(): MyPlayer[] {
    return [
      { playerId: this.hostId, localName: null },
      ...this.room.players
        .filter((p) => p.isLocal)
        .map((p) => ({ playerId: p.id, localName: p.name })),
    ];
  }

  private clearPendingGuess(): void {
    this.pendingGuessResult = null;
    this.pendingGuessBy = null;
    this.pendingGuessText = null;
  }

  /**
   * A round that nobody will ever finish — the player whose turn it was is
   * gone. Guarded by recordRound's own `roundRecorded` check, so a disconnect
   * during the reveal does not log the round a second time.
   */
  private recordAbandonedRound(
    active: { id: string; name: string } | null,
    song: Song | null,
  ): void {
    if (!active || !song) return;
    this.recordRound(
      { outcome: "abandoned", position: null, correct: null, buzz: null },
      { song, activeId: active.id, activeName: active.name },
    );
  }

  /**
   * No song could be produced. Ends the game either way — there is nothing to
   * play — but says which of the two very different reasons it was, so nobody
   * goes looking for a problem in a playlist that is perfectly fine.
   */
  private finishNoSong(): void {
    if (this.fetchFailed) {
      logger.error("p2p", "Song fetch kept failing — ending the game");
      // The host's own error never survives the relay round trip, so write it
      // straight to the store the banner reads.
      useP2PStore
        .getState()
        .setLastError(
          "Couldn't load the next song from Spotify. Check the connection and start a new game.",
        );
    }
    this.finishGame("playlist-exhausted");
  }

  /** Flip to the end screen, recording WHY — the recap needs the reason */
  private finishGame(reason: RecapReason): void {
    this.endedReason = reason;
    this.clearTurnGrace();
    this.clearPlaceTimer();
    this.room = { ...this.room, phase: "finished", placeDeadline: null };
  }

  /**
   * Guess rewards (+1★ title+artist, +1★ exact year) are held back until the
   * reveal — awarding them at guess time would leak the verdict through the
   * broadcast token count.
   */
  private applyGuessReward(): number {
    if (!this.pendingGuessResult || !this.pendingGuessBy) return 0;
    const reward = logic.guessReward(this.pendingGuessResult);
    this.room = logic.awardTokens(this.room, this.pendingGuessBy, reward);
    return reward;
  }

  /** The buzzer's countdown ran out — lock in their provisional pick or forfeit */
  private handleBuzzTimeout(): void {
    this.buzzTimer = null;
    if (this.room.phase !== "bitster-window" || !this.room.buzzerId) return;
    logger.info(
      "p2p",
      `Buzz timer expired — ${this.pendingBuzzPosition !== null ? "locking in provisional pick" : "forfeiting"}`,
    );
    this.doRevealSong(this.pendingBuzzPosition);
  }

  private clearBuzzTimer(): void {
    if (this.buzzTimer) {
      clearTimeout(this.buzzTimer);
      this.buzzTimer = null;
    }
  }

  // -- Blitz mode (placement countdown) --

  /** Arm the placement countdown for the fresh song, if the rule is on */
  private armPlaceTimer(): void {
    this.clearPlaceTimer();
    const seconds = this.room.settings.rules.placement.timerSeconds;
    if (seconds === null || this.room.phase !== "playing") {
      this.room = { ...this.room, placeDeadline: null };
      return;
    }
    const timerMs = seconds * 1000;
    this.room = { ...this.room, placeDeadline: Date.now() + timerMs };
    this.placeTimer = setTimeout(() => this.handlePlaceTimeout(), timerMs);
  }

  /** Blitz: time ran out before the active player placed — song is lost */
  private handlePlaceTimeout(): void {
    this.placeTimer = null;
    if (this.room.phase !== "playing" || !this.room.currentSong) return;
    if (this.room.buzzerId) return;
    logger.info("p2p", "Placement timer expired — forfeiting the song");

    const currentPlayer = logic.getCurrentPlayer(this.room);
    const forfeitedSong = this.room.currentSong;
    const { room: forfeited, result } = logic.forfeitPlacement(this.room);
    this.room = forfeited;
    if (currentPlayer) {
      this.room = logic.bumpStat(this.room, currentPlayer.id, "placedWrong");
    }
    const guessTokens = this.applyGuessReward();
    this.recordRound(
      {
        outcome: "timeout",
        position: null,
        correct: false,
        buzz: null,
        guessTokens,
      },
      currentPlayer && forfeitedSong
        ? {
            song: forfeitedSong,
            activeId: currentPlayer.id,
            activeName: currentPlayer.name,
          }
        : undefined,
    );
    this.broadcastState(result);
  }

  private clearPlaceTimer(): void {
    if (this.placeTimer) {
      clearTimeout(this.placeTimer);
      this.placeTimer = null;
    }
  }

  // -- Streaming Integration --

  /**
   * One request that says how much of this playlist the host's account can
   * actually play. Runs in the lobby where latency is free, and stays
   * host-local: it measures the HOST's availability, which is not necessarily
   * anyone else's. Never blocks the lobby — a failed probe just shows nothing.
   */
  private async probePlaylist(playlistId: string | null): Promise<void> {
    const store = useStreamingStore.getState();
    store.setPlaylistProbe(null);
    if (!playlistId) return;

    const provider = store.activeProviderId
      ? getProvider(store.activeProviderId)
      : null;
    if (!provider?.library.probePlaylist) return;

    try {
      const probe = await provider.library.probePlaylist(playlistId);
      if (!probe) return;
      useStreamingStore.getState().setPlaylistProbe(probe);
      logger.info(
        "p2p",
        `Playlist probe: ${probe.usable}/${probe.checked} usable` +
          (probe.availabilityUnknown
            ? " (no availability flag from the provider)"
            : ""),
      );
    } catch (err) {
      logger.warn("p2p", `Playlist probe failed: ${err}`);
    }
  }

  private async resolvePlaylist(playlistUrl: string): Promise<{
    playlistId: string;
    name: string;
    trackCount: number;
    imageUrl: string | null;
    /** Canonical share link, so the end screen can pass the playlist around */
    url: string;
  } | null> {
    const providerId = useStreamingStore.getState().activeProviderId;
    const provider = providerId ? getProvider(providerId) : null;

    if (!provider || !playlistUrl) return null;

    const playlistId = provider.library.parsePlaylistUrl(playlistUrl);
    if (!playlistId) return null;

    try {
      const meta = await provider.library.getPlaylistMeta(playlistId);
      if (meta.trackCount === 0) return null;
      logger.info(
        "p2p",
        `Playlist "${meta.name}" — ${meta.trackCount} tracks (lazy loading)`,
      );
      return {
        playlistId,
        name: meta.name,
        trackCount: meta.trackCount,
        imageUrl: meta.imageUrl,
        url: provider.library.buildPlaylistUrl(playlistId),
      };
    } catch (err) {
      logger.error("p2p", `Playlist meta failed: ${err}`);
      return null;
    }
  }

  /**
   * Picks a random song and plays it on all devices.
   * Uses lazy loading (1 API call) for provider playlists,
   * or the in-memory array for mock playlists.
   */
  private async pickAndPlayNextSong(): Promise<boolean> {
    let song: Song | null = null;
    this.fetchFailed = false;

    const playlistId = this.room.playlistId;
    if (playlistId) {
      // Lazy loading — fetch one track at a random index
      const providerId = useStreamingStore.getState().activeProviderId;
      const provider = providerId ? getProvider(providerId) : null;
      if (!provider) return false;

      // Two different budgets on purpose: a slot that holds nothing usable is
      // spent, a request that failed is retried. Mixing them is what let a
      // rate limit eat the playlist and end the game as "exhausted".
      let slotsTried = 0;
      let transientRetries = 0;
      while (slotsTried < PICK_ATTEMPTS) {
        const index = logic.pickRandomIndex(
          this.room.playlistTrackCount,
          this.room.playedIndices,
        );
        // Genuinely nothing left to pick
        if (index === null) return false;

        try {
          const track = await provider.library.getTrackAtIndex(
            playlistId,
            index,
          );
          if (track) {
            this.room = logic.setSongFromIndex(this.room, track, index);
            song = track;
            break;
          }
        } catch (err) {
          if (err instanceof StreamingFetchError) {
            logger.warn(
              "p2p",
              `Track fetch failed (${err.status}) at index ${index}: ${err.message}`,
            );
            if (err.transient && transientRetries < MAX_TRANSIENT_RETRIES) {
              // The slot is probably fine — do NOT mark it as used
              transientRetries++;
              await new Promise((resolve) =>
                setTimeout(resolve, TRANSIENT_RETRY_MS),
              );
              continue;
            }
            // Out of retries, or an error that will not fix itself
            this.fetchFailed = true;
            return false;
          }
          logger.warn("p2p", `Track at index ${index} unusable: ${err}`);
        }

        // This slot really had nothing playable in it — don't come back to it
        slotsTried++;
        this.room = {
          ...this.room,
          playedIndices: [...this.room.playedIndices, index],
        };
      }
    } else {
      // Mock/fallback — use in-memory array
      const pick = logic.pickRandomSong(this.room);
      if (!pick) return false;
      this.room = pick.room;
      song = pick.song;
    }

    if (!song) return false;

    await this.playSongOnAllDevices(song.uri);
    // Blitz mode: the countdown starts once the fresh song is rolling
    this.armPlaceTimer();
    // The single "a new round began" point — every path comes through here
    this.roundStartedAt = Date.now();
    this.roundRecorded = false;
    this.pendingPosition = null;
    return true;
  }

  private async playSongOnAllDevices(uri: string): Promise<void> {
    this.send({ type: "play-song", payload: { uri } });

    // Demo/mock songs have no real track behind them — a play request would
    // only earn a 400 from the provider. The demo game runs silently.
    if (uri.startsWith("mock:")) return;

    const providerId = useStreamingStore.getState().activeProviderId;
    const provider = providerId ? getProvider(providerId) : null;
    if (provider) {
      useStreamingStore.getState().setPlaybackError(null);
      try {
        await provider.player.play(uri);
      } catch (err) {
        logger.error("p2p", `Host playback failed: ${err}`);
        useStreamingStore
          .getState()
          .setPlaybackError(
            err instanceof Error ? err.message : "Playback failed",
          );
      }
    }
  }
}

// -- Mock Data (fallback until streaming provider is connected) --

function getMockPlaylist(): Song[] {
  return [
    {
      id: "1",
      uri: "mock:1",
      name: "Bohemian Rhapsody",
      artist: "Queen",
      year: 1975,
    },
    {
      id: "2",
      uri: "mock:2",
      name: "Billie Jean",
      artist: "Michael Jackson",
      year: 1982,
    },
    {
      id: "3",
      uri: "mock:3",
      name: "Smells Like Teen Spirit",
      artist: "Nirvana",
      year: 1991,
    },
    {
      id: "4",
      uri: "mock:4",
      name: "Lose Yourself",
      artist: "Eminem",
      year: 2002,
    },
    {
      id: "5",
      uri: "mock:5",
      name: "Rolling in the Deep",
      artist: "Adele",
      year: 2010,
    },
    {
      id: "6",
      uri: "mock:6",
      name: "Shape of You",
      artist: "Ed Sheeran",
      year: 2017,
    },
    {
      id: "7",
      uri: "mock:7",
      name: "Blinding Lights",
      artist: "The Weeknd",
      year: 2019,
    },
    {
      id: "8",
      uri: "mock:8",
      name: "Hotel California",
      artist: "Eagles",
      year: 1977,
    },
    {
      id: "9",
      uri: "mock:9",
      name: "Sweet Child O' Mine",
      artist: "Guns N' Roses",
      year: 1987,
    },
    {
      id: "10",
      uri: "mock:10",
      name: "Wonderwall",
      artist: "Oasis",
      year: 1995,
    },
    {
      id: "11",
      uri: "mock:11",
      name: "Hey Ya!",
      artist: "OutKast",
      year: 2003,
    },
    {
      id: "12",
      uri: "mock:12",
      name: "Uptown Funk",
      artist: "Bruno Mars",
      year: 2014,
    },
  ];
}
