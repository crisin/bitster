import * as logic from "@/game/logic";
import { useGameStore } from "@/game/store";
import type { PlacementResult, Room, Song } from "@/game/types";
import { getProvider } from "@/streaming/registry";
import { useStreamingStore } from "@/streaming/store";
import { log as logger } from "@/utils/logger";
import type { P2PAction } from "./protocol";
import { useP2PStore } from "./store";

/** Injected by the transport layer — sends to one peer or (default) everyone */
export type SendFn = (action: P2PAction, target?: string) => void;

/** Peers that connect but never complete the join handshake get pruned */
const PLACEHOLDER_TIMEOUT_MS = 10_000;

interface GuessOutcome {
  titleCorrect: boolean;
  artistCorrect: boolean;
}

/**
 * The host's authoritative game session. Owns the full Room state, validates
 * every incoming action, and broadcasts the resulting GameState. Has no
 * knowledge of the transport — `send` is injected, which keeps it testable.
 */
export class HostSession {
  private room: Room;
  private pendingResult: PlacementResult | null = null;
  private pendingGuessResult: GuessOutcome | null = null;
  private placeholderTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private buzzTimer: ReturnType<typeof setTimeout> | null = null;
  /** Gap the buzzer has provisionally selected — auto-locked in on timeout */
  private pendingBuzzPosition: number | null = null;

  constructor(
    private readonly send: SendFn,
    roomCode: string,
    private readonly hostId: string,
    hostName: string,
  ) {
    this.room = logic.createRoom(roomCode, hostId, hostName);
  }

  destroy(): void {
    for (const timer of this.placeholderTimers.values()) {
      clearTimeout(timer);
    }
    this.placeholderTimers.clear();
    this.clearBuzzTimer();
  }

  /** A peer's socket connected — track it and show them the room is alive */
  handlePeerConnected(peerId: string): void {
    useP2PStore.getState().addPeer({ id: peerId, name: "", connected: true });
    this.send(
      { type: "game-state", payload: logic.buildGameState(this.room) },
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

  handlePeerLeft(peerId: string): void {
    this.clearPlaceholderTimer(peerId);

    const wasCurrentPlayer = logic.getCurrentPlayer(this.room)?.id === peerId;
    const wasBuzzer = this.room.buzzerId === peerId;

    // If current player disconnects during bitster-window, undo their tentative placement
    if (
      wasCurrentPlayer &&
      this.room.phase === "bitster-window" &&
      this.pendingResult
    ) {
      this.room = logic.undoPlacement(
        this.room,
        peerId,
        this.pendingResult.song.id,
      );
      this.pendingResult = null;
    }

    this.room = logic.removePlayer(this.room, peerId);

    if (wasBuzzer) {
      this.clearBuzzTimer();
      this.room = { ...this.room, buzzerId: null, buzzDeadline: null };
    }

    // Not enough players to continue
    if (this.room.players.length < 2 && this.room.phase !== "lobby") {
      this.room = { ...this.room, phase: "finished" };
      this.pendingResult = null;
      this.broadcastState();
      return;
    }

    // Auto-advance if the current player disconnected mid-turn
    if (
      wasCurrentPlayer &&
      (this.room.phase === "playing" ||
        this.room.phase === "reveal" ||
        this.room.phase === "bitster-window")
    ) {
      this.room = logic.advanceTurn(this.room);
      void this.pickAndPlayNextSong().then((picked) => {
        if (!picked) {
          this.room = { ...this.room, phase: "finished" };
        }
        this.broadcastState();
      });
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

  async handleAction(action: P2PAction, fromPeerId: string): Promise<void> {
    try {
      switch (action.type) {
        case "join": {
          this.clearPlaceholderTimer(fromPeerId);
          this.room = logic.addPlayer(
            this.room,
            fromPeerId,
            action.payload.name,
          );
          useP2PStore
            .getState()
            .updatePeer(fromPeerId, { name: action.payload.name });
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
            action.payload.name,
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
          this.pendingGuessResult = null;
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
          // With a streaming provider connected, a game without a playlist
          // would only produce playback errors (mock URIs aren't playable) —
          // refuse and stay in the lobby. The demo fallback below stays
          // available when no provider is connected (dev/testing).
          if (
            !meta &&
            useStreamingStore.getState().authStatus === "authenticated"
          ) {
            this.sendError("Add a playlist before starting", fromPeerId);
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
            this.room = { ...this.room, playlistImageUrl: meta.imageUrl };
          } else {
            // No provider or URL — fallback to mock
            this.room = logic.startGame(
              this.room,
              getMockPlaylist(),
              "Demo Playlist",
            );
            this.room = { ...this.room, playlistImageUrl: null };
          }
          const picked = await this.pickAndPlayNextSong();
          if (!picked) {
            this.room = { ...this.room, phase: "finished" };
          }
          this.broadcastState();
          break;
        }

        case "place-song": {
          if (this.room.phase !== "playing") return;
          if (this.room.buzzerId) {
            this.sendError("Wait for buzzer to place", fromPeerId);
            return;
          }
          const current = logic.getCurrentPlayer(this.room);
          if (current?.id !== fromPeerId) {
            this.sendError("Not your turn", fromPeerId);
            return;
          }
          const { room: updated, result } = logic.placeSong(
            this.room,
            fromPeerId,
            action.payload.position,
          );
          this.room = updated;
          // Store result for reveal — don't broadcast yet (year hidden during bitster-window)
          this.pendingResult = result;
          this.broadcastState();
          break;
        }

        case "guess-song": {
          // Active player guesses BEFORE placing (during playing phase)
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
          const guessResult = logic.guessSongInfo(
            this.room,
            fromPeerId,
            action.payload.title,
            action.payload.artist,
          );
          this.room = guessResult.room;
          logger.debug(
            "p2p",
            `guess result: title=${guessResult.titleCorrect}, artist=${guessResult.artistCorrect}`,
          );
          // Store result — feedback shown after placing (bitster-window phase)
          this.pendingGuessResult = {
            titleCorrect: guessResult.titleCorrect,
            artistCorrect: guessResult.artistCorrect,
          };
          // Broadcast updated tokens but don't reveal guess correctness yet
          this.broadcastState();
          break;
        }

        case "skip-song": {
          if (this.room.phase !== "playing") return;
          const currentForSkip = logic.getCurrentPlayer(this.room);
          if (fromPeerId !== currentForSkip?.id) return;
          this.room = logic.skipSong(this.room, fromPeerId);
          this.pendingGuessResult = null;
          const skipPicked = await this.pickAndPlayNextSong();
          if (!skipPicked) {
            this.room = { ...this.room, phase: "finished" };
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
          this.pendingGuessResult = null;
          const winner = logic.checkWinCondition(this.room);
          if (winner) {
            this.room = { ...this.room, phase: "finished" };
            this.broadcastState();
          } else {
            this.room = logic.advanceTurn(this.room);
            const nextPicked = await this.pickAndPlayNextSong();
            if (!nextPicked) {
              this.room = { ...this.room, phase: "finished" };
            }
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
          this.room = playlistMeta
            ? {
                ...this.room,
                playlistName: playlistMeta.name,
                playlistImageUrl: playlistMeta.imageUrl,
                playlistId: playlistMeta.playlistId,
                playlistTrackCount: playlistMeta.trackCount,
              }
            : {
                ...this.room,
                playlistName: null,
                playlistImageUrl: null,
                playlistId: null,
                playlistTrackCount: 0,
              };
          this.broadcastState();
          break;
        }

        case "update-settings": {
          if (fromPeerId !== this.room.hostId) return;
          this.room = {
            ...this.room,
            settings: { ...this.room.settings, ...action.payload },
          };
          this.broadcastState();
          break;
        }

        case "rematch": {
          if (fromPeerId !== this.room.hostId) return;
          this.pendingGuessResult = null;
          this.pendingResult = null;
          this.clearBuzzTimer();
          this.pendingBuzzPosition = null;
          this.room = {
            ...this.room,
            phase: "lobby",
            playedSongs: [],
            playedIndices: [],
            currentSong: null,
            currentPlayerIndex: 0,
            buzzerId: null,
            buzzDeadline: null,
            passedIds: [],
            players: this.room.players.map((p) => ({
              ...p,
              score: 0,
              timeline: [],
              tokens: 2,
              failedSongs: [],
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
    const state = logic.buildGameState(this.room);
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
  }

  private sendError(message: string, target: string): void {
    this.send({ type: "error", payload: { message } }, target);
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

    // If active player was wrong, remove the tentatively placed card
    if (!this.pendingResult.correct && currentPlayer) {
      this.room = logic.undoPlacement(
        this.room,
        currentPlayer.id,
        this.pendingResult.song.id,
      );
    }

    // Handle buzz resolution
    if (this.room.buzzerId && buzzPosition !== null) {
      if (this.pendingResult.correct) {
        // Active player was right — buzzer challenged incorrectly (token already spent)
        this.room = { ...this.room, buzzerId: null };
      } else {
        // Active player wrong — resolve buzzer's placement
        try {
          const { room: buzzRoom } = logic.resolveBuzz(this.room, buzzPosition);
          this.room = buzzRoom;
        } catch (err) {
          // Invalid position (e.g. stale provisional pick) — buzz forfeits
          logger.warn("p2p", `Buzz resolution failed: ${err}`);
          this.room = { ...this.room, buzzerId: null };
        }
      }
    }

    // Transition to reveal
    this.room = {
      ...this.room,
      phase: "reveal",
      buzzerId: null,
      buzzDeadline: null,
    };
    this.broadcastState(this.pendingResult);
    this.pendingResult = null;
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

  // -- Streaming Integration --

  private async resolvePlaylist(playlistUrl: string): Promise<{
    playlistId: string;
    name: string;
    trackCount: number;
    imageUrl: string | null;
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

    const playlistId = this.room.playlistId;
    if (playlistId) {
      // Lazy loading — fetch one track at a random index
      const providerId = useStreamingStore.getState().activeProviderId;
      const provider = providerId ? getProvider(providerId) : null;
      if (!provider) return false;

      // Try up to 5 indices (some tracks may be unavailable/missing year)
      for (let attempt = 0; attempt < 5; attempt++) {
        const index = logic.pickRandomIndex(
          this.room.playlistTrackCount,
          this.room.playedIndices,
        );
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
          logger.warn("p2p", `Track fetch at index ${index} failed: ${err}`);
        }
        // Mark this index as used so we don't retry it
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
    return true;
  }

  private async playSongOnAllDevices(uri: string): Promise<void> {
    this.send({ type: "play-song", payload: { uri } });

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
