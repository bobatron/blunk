import { createContext } from "react";
import type { LobbyPlayer, RoomConfig } from "./GameServerConnection";

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
  errorMessage: string | null;
  startRound: () => void;
  setConfig: (config: RoomConfig) => void;
  sendBlunk: () => void;
  sendEyesMissing: () => void;
  earnPowerup: () => void;
  usePowerup: () => void;
}

export const GameServerContext = createContext<GameServerState | null>(null);
