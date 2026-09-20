import { useContext } from "react";
import { GameServerContext, type GameServerState } from "./context";

export function useGameServer(): GameServerState {
  const ctx = useContext(GameServerContext);
  if (!ctx) throw new Error("useGameServer must be used within a GameServerProvider");
  return ctx;
}
