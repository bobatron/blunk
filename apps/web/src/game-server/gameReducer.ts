import type { LobbyPlayer, RoomConfig, ServerBug } from "./GameServerConnection";
import type { GameState, HuntBug } from "./gameState";

/** One event per message the game-server can send, plus two synthetic ones
 * (dismiss-reel, blink-break-expired) for state changes the UI or a timer
 * triggers rather than the server. Mirrors GameServerConnection's events —
 * `now` is passed in explicitly (rather than the reducer calling Date.now()
 * itself) so the reducer stays a pure function of (state, event). */
export type GameEvent =
  | { type: "joined"; playerId: string }
  | { type: "lobby-state"; players: LobbyPlayer[]; roundActive: boolean; config: RoomConfig }
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
  | { type: "error"; message: string }
  | { type: "dismiss-reel" };

export function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "joined":
      return { ...state, playerId: event.playerId };

    case "lobby-state": {
      const playerNames = { ...state.playerNames };
      for (const p of event.players) playerNames[p.id] = p.name;
      return { ...state, players: event.players, roundActive: event.roundActive, config: event.config, playerNames };
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

    case "error":
      return { ...state, errorMessage: event.message };

    default:
      return state;
  }
}
