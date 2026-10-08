import type {
  LobbyPlayer,
  ModeKey,
  PathPoint,
  RoomConfig,
  RoomType,
  SpotStreamAward,
  SpotStreamJudgeVote,
} from "./GameServerConnection";

export interface Elimination {
  playerId: string;
  place: number;
}

export interface LifeLostEvent {
  playerId: string;
  livesLeft: number;
  reason: "eye-closed" | "eyes-missing" | "photo";
  /** Changes every event so consumers can react to repeats. */
  key: number;
}

/** A Bug Hunt bug with its path converted to this browser's clock. */
export interface HuntBug {
  id: number;
  spawnAt: number;
  expiresAt: number;
  path: PathPoint[];
}

/** A mode vote in progress, "random games" lobbies only. */
export interface VoteUiState {
  endsAt: number;
  modes: ModeKey[];
  voteCount: number;
}

/** Spot the Real Stream, in progress. */
export interface SpotStreamUiState {
  modelId: string;
  phase: "posing" | "voting" | "reveal";
  poseEndsAt: number | null;
  frame: string | null;
  boxCount: number;
  liveBoxIndex: number | null;
  votingEndsAt: number | null;
  voteCount: number;
}

export interface SpotStreamResult {
  modelId: string;
  liveBoxIndex: number;
  judgeVotes: SpotStreamJudgeVote[];
  awards: SpotStreamAward[];
}

/** The data half of game state — everything the reducer owns. The action
 * functions (startRound, sendBlunk, ...) live alongside this in
 * GameServerState (context.ts), not here — they talk to the connection,
 * not the reducer. */
export interface GameState {
  playerId: string | null;
  players: LobbyPlayer[];
  /** Every player id/name seen this session, even ones who've since left. */
  playerNames: Record<string, string>;
  /** Decided once, by whoever's first into a fresh room. Null until the
   * first lobby-state arrives (or for a room an old client created). */
  roomType: RoomType | null;
  config: RoomConfig;
  roundActive: boolean;
  /** Epoch ms when the round times out, or null for no time limit. */
  roundEndsAt: number | null;
  eliminations: Elimination[];
  winnerId: string | null | undefined; // undefined = no round has finished yet
  /** Cumulative round wins this session, keyed by player id. */
  scores: Record<string, number>;
  /** Player id -> epoch ms when their blink-break ends. */
  blinkBreaks: Record<string, number>;
  lastLifeLost: LifeLostEvent | null;
  /** Latest sunglasses photo, so everyone can hear the shutter. */
  lastPhoto: { playerId: string; key: number } | null;
  /** Bug Hunt round in the lobby: when it ends, eaten counts, and the live bugs. */
  bugHunt: { endsAt: number; eaten: Record<string, number>; bugs: HuntBug[] } | null;
  /** Latest bug claim, so the player who got it can be told. */
  huntClaim: { bugId: number; playerId: string; key: number } | null;
  /** Results of the last Bug Hunt, ranked. */
  bugHuntResults: { playerId: string; eaten: number }[] | null;
  /** Face snapshots from the current round. */
  snapshots: { id: number; playerId: string; image: string }[];
  /** Snapshots from the round that just ended, played as a looping slideshow until the next round. */
  reel: { key: number; items: { id: number; playerId: string; image: string }[] } | null;
  /** The mode vote currently running, "random games" lobbies only. */
  vote: VoteUiState | null;
  /** The mode that just won a vote — a brief announcement, cleared once that mode actually starts. */
  votingResolvedMode: ModeKey | null;
  /** Spot the Real Stream, in progress. */
  spotStream: SpotStreamUiState | null;
  /** Bumped on every "spot-stream-capture" — the model's client captures and
   * sends a frame when this changes, BEFORE the flash fires (see
   * spotStreamFlashKey below), so the still isn't lit by the screen's own flash. */
  spotStreamCaptureKey: number;
  /** Bumped on every "spot-stream-flash" — purely the visual/audio cue, fired
   * only after the capture above has already happened. */
  spotStreamFlashKey: number;
  /** The reveal from the last finished Spot the Real Stream round. */
  spotStreamResult: SpotStreamResult | null;
  errorMessage: string | null;
  /** Server-clock to browser-clock offset, refreshed whenever the server sends a time. */
  clockOffset: number;
  /** Internal counters for generating unique keys — not for display. */
  lifeKeyCounter: number;
  snapshotIdCounter: number;
  reelKeyCounter: number;
}

export const DEFAULT_CONFIG: RoomConfig = { lives: 3, timeLimitSec: 90 };

export const initialGameState: GameState = {
  playerId: null,
  players: [],
  playerNames: {},
  roomType: null,
  config: DEFAULT_CONFIG,
  roundActive: false,
  roundEndsAt: null,
  eliminations: [],
  winnerId: undefined,
  scores: {},
  blinkBreaks: {},
  lastLifeLost: null,
  lastPhoto: null,
  bugHunt: null,
  huntClaim: null,
  bugHuntResults: null,
  snapshots: [],
  reel: null,
  vote: null,
  votingResolvedMode: null,
  spotStream: null,
  spotStreamCaptureKey: 0,
  spotStreamFlashKey: 0,
  spotStreamResult: null,
  errorMessage: null,
  clockOffset: 0,
  lifeKeyCounter: 0,
  snapshotIdCounter: 0,
  reelKeyCounter: 0,
};
