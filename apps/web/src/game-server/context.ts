import { createContext } from "react";
import type { LobbyPlayer, PathPoint, RoomConfig } from "./GameServerConnection";

export interface Elimination {
  playerId: string;
  place: number;
}

export interface LifeLostEvent {
  playerId: string;
  livesLeft: number;
  reason: "eye-closed" | "eyes-missing";
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

export interface GameServerState {
  playerId: string | null;
  players: LobbyPlayer[];
  /** Every player id/name seen this session, even ones who've since left. */
  playerNames: Record<string, string>;
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
  dismissReel: () => void;
  errorMessage: string | null;
  startRound: () => void;
  setConfig: (config: RoomConfig) => void;
  sendBlunk: () => void;
  sendEyesMissing: () => void;
  earnPowerup: () => void;
  usePowerup: () => void;
  startBugHunt: () => void;
  claimBug: (bugId: number) => void;
  sendSnapshot: (image: string) => void;
}

export const GameServerContext = createContext<GameServerState | null>(null);
