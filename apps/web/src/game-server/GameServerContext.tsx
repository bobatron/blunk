import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameServerConnection } from "./GameServerConnection";
import { GAME_SERVER_URL } from "../config";
import { GameServerContext, type Elimination, type GameServerState } from "./context";

export function GameServerProvider({
  roomName,
  participantName,
  children,
}: {
  roomName: string;
  participantName: string;
  children: ReactNode;
}) {
  const connectionRef = useRef<GameServerConnection | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [roundActive, setRoundActive] = useState(false);
  const [eliminations, setEliminations] = useState<Elimination[]>([]);
  const [winnerId, setWinnerId] = useState<string | null | undefined>(undefined);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const connection = new GameServerConnection(GAME_SERVER_URL, roomName, participantName);
    connectionRef.current = connection;

    const unsubs = [
      connection.on("joined", ({ playerId }) => setPlayerId(playerId)),
      connection.on("lobby-state", ({ players, roundActive }) => {
        setPlayers(players);
        setRoundActive(roundActive);
        setPlayerNames((prev) => {
          const next = { ...prev };
          for (const p of players) next[p.id] = p.name;
          return next;
        });
      }),
      connection.on("round-started", () => {
        setRoundActive(true);
        setEliminations([]);
        setWinnerId(undefined);
      }),
      connection.on("player-eliminated", ({ playerId, place }) => {
        setEliminations((prev) => [...prev, { playerId, place }]);
      }),
      connection.on("round-over", ({ winnerId }) => {
        setRoundActive(false);
        setWinnerId(winnerId);
        // A game has exactly one winner — that's the only point awarded.
        if (winnerId) {
          setScores((prev) => ({ ...prev, [winnerId]: (prev[winnerId] ?? 0) + 1 }));
        }
      }),
      connection.on("error", ({ message }) => setErrorMessage(message)),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      connection.close();
    };
  }, [roomName, participantName]);

  const value: GameServerState = {
    playerId,
    players,
    playerNames,
    roundActive,
    eliminations,
    winnerId,
    scores,
    errorMessage,
    startRound: () => connectionRef.current?.startRound(),
    sendBlunk: () => connectionRef.current?.sendBlunk(),
  };

  return <GameServerContext.Provider value={value}>{children}</GameServerContext.Provider>;
}
