import { createContext } from "react";

export interface Elimination {
  playerId: string;
  place: number;
}

export interface GameServerState {
  playerId: string | null;
  players: { id: string; name: string }[];
  /** Every player id/name seen this session, even ones who've since left —
   * so the scoreboard can still show their name and points. */
  playerNames: Record<string, string>;
  roundActive: boolean;
  eliminations: Elimination[];
  winnerId: string | null | undefined; // undefined = no round has finished yet
  /** Cumulative points across all rounds this session, keyed by player id. */
  scores: Record<string, number>;
  errorMessage: string | null;
  startRound: () => void;
  sendBlunk: () => void;
}

export const GameServerContext = createContext<GameServerState | null>(null);
