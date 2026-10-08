import type {
  LobbyPlayer,
  ModeKey,
  RoomConfig,
  RoomType,
  ServerBug,
  SpotStreamAward,
  SpotStreamJudgeVote,
} from "./GameServerConnection";
import type { GameState, HuntBug } from "./gameState";

/** One event per message the game-server can send, plus two synthetic ones
 * (dismiss-reel, blink-break-expired) for state changes the UI or a timer
 * triggers rather than the server. Mirrors GameServerConnection's events —
 * `now` is passed in explicitly (rather than the reducer calling Date.now()
 * itself) so the reducer stays a pure function of (state, event). */
export type GameEvent =
  | { type: "joined"; playerId: string }
  | {
      type: "lobby-state";
      players: LobbyPlayer[];
      roundActive: boolean;
      config: RoomConfig;
      roomType: RoomType | null;
    }
  | { type: "round-started"; endsAt: number | null }
  | { type: "life-lost"; playerId: string; livesLeft: number; reason: "eye-closed" | "eyes-missing" | "photo" }
  | { type: "photo-taken"; playerId: string }
  | { type: "player-eliminated"; playerId: string; place: number }
  | { type: "blink-break"; playerId: string; until: number }
  | { type: "blink-break-expired"; playerId: string; until: number }
  | { type: "round-over"; winnerId: string | null }
  | { type: "bug-hunt-started"; endsAt: number; serverNow: number; now: number }
  | { type: "bug-spawn"; bug: ServerBug; serverNow: number; now: number }
  | { type: "bug-claimed"; bugId: number; playerId: string }
  | { type: "bug-hunt-scores"; eaten: Record<string, number> }
  | { type: "bug-hunt-over"; results: { playerId: string; eaten: number }[] }
  | { type: "round-snapshot"; playerId: string; image: string }
  | { type: "voting-started"; endsAt: number; modes: ModeKey[]; serverNow: number; now: number }
  | { type: "vote-cast"; voteCount: number }
  | { type: "voting-resolved"; mode: ModeKey }
  | { type: "spot-stream-started"; modelId: string; poseEndsAt: number; serverNow: number; now: number }
  | { type: "spot-stream-capture" }
  | { type: "spot-stream-flash" }
  | {
      type: "spot-stream-voting";
      frame: string;
      boxCount: number;
      liveBoxIndex: number;
      votingEndsAt: number;
      serverNow: number;
      now: number;
    }
  | { type: "spot-stream-vote-cast"; voteCount: number }
  | { type: "spot-stream-voided" }
  | { type: "spot-stream-series-over" }
  | {
      type: "spot-stream-over";
      modelId: string;
      liveBoxIndex: number;
      judgeVotes: SpotStreamJudgeVote[];
      awards: SpotStreamAward[];
    }
  | { type: "error"; message: string }
  | { type: "dismiss-reel" };

export function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "joined":
      return { ...state, playerId: event.playerId };

    case "lobby-state": {
      const playerNames = { ...state.playerNames };
      for (const p of event.players) playerNames[p.id] = p.name;
      return {
        ...state,
        players: event.players,
        roundActive: event.roundActive,
        config: event.config,
        roomType: event.roomType,
        playerNames,
      };
    }

    case "round-started":
      return {
        ...state,
        roundActive: true,
        roundEndsAt: event.endsAt,
        eliminations: [],
        winnerId: undefined,
        blinkBreaks: {},
        snapshots: [],
        reel: null,
        votingResolvedMode: null,
        spotStreamResult: null,
      };

    case "life-lost": {
      const key = state.lifeKeyCounter + 1;
      return {
        ...state,
        lifeKeyCounter: key,
        lastLifeLost: { playerId: event.playerId, livesLeft: event.livesLeft, reason: event.reason, key },
      };
    }

    case "photo-taken": {
      const key = state.lifeKeyCounter + 1;
      return { ...state, lifeKeyCounter: key, lastPhoto: { playerId: event.playerId, key } };
    }

    case "player-eliminated":
      return {
        ...state,
        eliminations: [...state.eliminations, { playerId: event.playerId, place: event.place }],
      };

    case "blink-break":
      return { ...state, blinkBreaks: { ...state.blinkBreaks, [event.playerId]: event.until } };

    case "blink-break-expired": {
      // A newer blink-break may have replaced this one since the timer was set —
      // only clear it if it's still the one we scheduled against.
      if (state.blinkBreaks[event.playerId] !== event.until) return state;
      const blinkBreaks = { ...state.blinkBreaks };
      delete blinkBreaks[event.playerId];
      return { ...state, blinkBreaks };
    }

    case "round-over": {
      const reel =
        state.snapshots.length > 0
          ? { key: state.reelKeyCounter + 1, items: state.snapshots }
          : state.reel;
      return {
        ...state,
        roundActive: false,
        roundEndsAt: null,
        winnerId: event.winnerId,
        reel,
        reelKeyCounter: state.snapshots.length > 0 ? state.reelKeyCounter + 1 : state.reelKeyCounter,
        // A game has exactly one winner — that's the only point awarded.
        scores: event.winnerId
          ? { ...state.scores, [event.winnerId]: (state.scores[event.winnerId] ?? 0) + 1 }
          : state.scores,
        // Elimination/blink-break badges belong only to this round — clear
        // them now rather than letting a stale "BLUNKED" overlay ride along
        // into whatever mode gets played next.
        eliminations: [],
        blinkBreaks: {},
      };
    }

    case "dismiss-reel":
      return { ...state, reel: null };

    case "round-snapshot": {
      const id = state.snapshotIdCounter + 1;
      return {
        ...state,
        snapshotIdCounter: id,
        snapshots: [...state.snapshots, { id, playerId: event.playerId, image: event.image }],
      };
    }

    case "bug-hunt-started": {
      const clockOffset = event.serverNow - event.now;
      return {
        ...state,
        clockOffset,
        bugHunt: { endsAt: event.endsAt - clockOffset, eaten: {}, bugs: [] },
        bugHuntResults: null,
        huntClaim: null,
        votingResolvedMode: null,
        spotStreamResult: null,
        eliminations: [],
        blinkBreaks: {},
      };
    }

    case "bug-spawn": {
      if (!state.bugHunt) return state;
      const clockOffset = event.serverNow - event.now;
      const bug: HuntBug = {
        id: event.bug.id,
        spawnAt: event.bug.spawnAt - clockOffset,
        expiresAt: event.bug.expiresAt - clockOffset,
        path: event.bug.path.map((p) => ({ ...p, t: p.t - clockOffset })),
      };
      return { ...state, clockOffset, bugHunt: { ...state.bugHunt, bugs: [...state.bugHunt.bugs, bug] } };
    }

    case "bug-claimed": {
      if (!state.bugHunt) return state;
      const key = state.lifeKeyCounter + 1;
      return {
        ...state,
        lifeKeyCounter: key,
        bugHunt: { ...state.bugHunt, bugs: state.bugHunt.bugs.filter((b) => b.id !== event.bugId) },
        huntClaim: { bugId: event.bugId, playerId: event.playerId, key },
      };
    }

    case "bug-hunt-scores": {
      if (!state.bugHunt) return state;
      return { ...state, bugHunt: { ...state.bugHunt, eaten: event.eaten } };
    }

    case "bug-hunt-over": {
      const ranked = [...event.results].sort((a, b) => b.eaten - a.eaten);
      const [first, second] = ranked;
      // Most bugs eaten earns the point, unless it's a tie for first or nobody ate any.
      const scores =
        first && first.eaten > 0 && (!second || second.eaten < first.eaten)
          ? { ...state.scores, [first.playerId]: (state.scores[first.playerId] ?? 0) + 1 }
          : state.scores;
      return { ...state, bugHunt: null, bugHuntResults: ranked, scores };
    }

    case "voting-started": {
      const clockOffset = event.serverNow - event.now;
      return {
        ...state,
        clockOffset,
        vote: { endsAt: event.endsAt - clockOffset, modes: event.modes, voteCount: 0 },
        votingResolvedMode: null,
      };
    }

    case "vote-cast":
      if (!state.vote) return state;
      return { ...state, vote: { ...state.vote, voteCount: event.voteCount } };

    case "voting-resolved":
      return { ...state, vote: null, votingResolvedMode: event.mode };

    case "spot-stream-started": {
      const clockOffset = event.serverNow - event.now;
      return {
        ...state,
        clockOffset,
        spotStream: {
          modelId: event.modelId,
          phase: "posing",
          poseEndsAt: event.poseEndsAt - clockOffset,
          frame: null,
          boxCount: 0,
          liveBoxIndex: null,
          votingEndsAt: null,
          voteCount: 0,
        },
        spotStreamResult: null,
        votingResolvedMode: null,
        eliminations: [],
        blinkBreaks: {},
      };
    }

    // No state change beyond the key bump — it's just the signal for the
    // model's own client to grab a frame, BEFORE the flash fires below.
    case "spot-stream-capture":
      return { ...state, spotStreamCaptureKey: state.spotStreamCaptureKey + 1 };

    // Purely the visual/audio cue — fires only once the capture above has
    // already happened, so the screen's own flash never lights the still.
    case "spot-stream-flash":
      return { ...state, spotStreamFlashKey: state.spotStreamFlashKey + 1 };

    case "spot-stream-voting": {
      if (!state.spotStream) return state;
      const clockOffset = event.serverNow - event.now;
      return {
        ...state,
        clockOffset,
        spotStream: {
          ...state.spotStream,
          phase: "voting",
          frame: event.frame,
          boxCount: event.boxCount,
          liveBoxIndex: event.liveBoxIndex,
          votingEndsAt: event.votingEndsAt - clockOffset,
        },
      };
    }

    case "spot-stream-vote-cast":
      if (!state.spotStream) return state;
      return { ...state, spotStream: { ...state.spotStream, voteCount: event.voteCount } };

    case "spot-stream-over": {
      const scores = event.awards.reduce(
        (acc, a) => ({ ...acc, [a.playerId]: (acc[a.playerId] ?? 0) + a.points }),
        state.scores,
      );
      return {
        ...state,
        // Stay on screen as a "reveal" — the model's box keeps showing their
        // real feed, free to move and prove it was them, for a few more
        // seconds before the next player's turn (or the whole series ending)
        // arrives as its own event.
        spotStream: state.spotStream ? { ...state.spotStream, phase: "reveal" } : null,
        spotStreamResult: {
          modelId: event.modelId,
          liveBoxIndex: event.liveBoxIndex,
          judgeVotes: event.judgeVotes,
          awards: event.awards,
        },
        scores,
      };
    }

    // The next turn's "spot-stream-started", or "spot-stream-series-over",
    // always follows immediately — so there's nothing to do here but wait
    // for whichever of those actually arrives.
    case "spot-stream-voided":
      return state;

    case "spot-stream-series-over":
      return { ...state, spotStream: null };

    case "error":
      return { ...state, errorMessage: event.message };

    default:
      return state;
  }
}
