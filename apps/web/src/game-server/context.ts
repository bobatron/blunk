import { createContext } from "react";
import type { RoomConfig } from "./GameServerConnection";
import type { GameState } from "./gameState";

export interface GameServerActions {
  dismissReel: () => void;
  startRound: () => void;
  setConfig: (config: RoomConfig) => void;
  sendBlunk: () => void;
  sendMaskedBlink: () => void;
  sendEyesMissing: () => void;
  earnPowerup: () => void;
  usePowerup: () => void;
  startBugHunt: () => void;
  claimBug: (bugId: number) => void;
  sendSnapshot: (image: string) => void;
}

/** Everything useGameServer() returns: the reducer-owned data, plus actions
 * that talk to the connection. */
export type GameServerState = GameState & GameServerActions;

export const GameServerContext = createContext<GameServerState | null>(null);
