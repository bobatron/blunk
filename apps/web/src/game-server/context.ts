import { createContext } from "react";

export interface Elimination {
  playerId: string;
  place: number;
}

export interface GameServerState {
  playerId: string | null;
  players: { id: string; name: string }[];
  roundActive: boolean;
  eliminations: Elimination[];
  winnerId: string | null | undefined; // undefined = no round has finished yet
  errorMessage: string | null;
  startRound: () => void;
  sendBlunk: () => void;
}

export const GameServerContext = createContext<GameServerState | null>(null);
