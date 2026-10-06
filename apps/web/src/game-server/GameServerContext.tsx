import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameServerConnection, type LobbyPlayer, type RoomConfig } from "./GameServerConnection";
import { GAME_SERVER_URL } from "../config";
import { GameServerContext, type Elimination, type GameServerState, type LifeLostEvent } from "./context";

const DEFAULT_CONFIG: RoomConfig = { lives: 3, timeLimitSec: 90 };

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
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [config, setConfigState] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [roundActive, setRoundActive] = useState(false);
  const [roundEndsAt, setRoundEndsAt] = useState<number | null>(null);
  const [eliminations, setEliminations] = useState<Elimination[]>([]);
  const [winnerId, setWinnerId] = useState<string | null | undefined>(undefined);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [blinkBreaks, setBlinkBreaks] = useState<Record<string, number>>({});
  const [lastLifeLost, setLastLifeLost] = useState<LifeLostEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const connection = new GameServerConnection(GAME_SERVER_URL, roomName, participantName);
    connectionRef.current = connection;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let lifeKey = 0;

    const unsubs = [
      connection.on("joined", ({ playerId }) => setPlayerId(playerId)),
      connection.on("lobby-state", ({ players, roundActive, config }) => {
        setPlayers(players);
        setRoundActive(roundActive);
        setConfigState(config);
        setPlayerNames((prev) => {
          const next = { ...prev };
          for (const p of players) next[p.id] = p.name;
          return next;
        });
      }),
      connection.on("round-started", ({ endsAt }) => {
        setRoundActive(true);
        setRoundEndsAt(endsAt);
        setEliminations([]);
        setWinnerId(undefined);
        setBlinkBreaks({});
      }),
      connection.on("life-lost", ({ playerId, livesLeft, reason }) => {
        lifeKey += 1;
        setLastLifeLost({ playerId, livesLeft, reason, key: lifeKey });
      }),
      connection.on("player-eliminated", ({ playerId, place }) => {
        setEliminations((prev) => [...prev, { playerId, place }]);
      }),
      connection.on("blink-break", ({ playerId, until }) => {
        setBlinkBreaks((prev) => ({ ...prev, [playerId]: until }));
        timers.push(
          setTimeout(() => {
            setBlinkBreaks((prev) => {
              const next = { ...prev };
              if (next[playerId] === until) delete next[playerId];
              return next;
            });
          }, Math.max(0, until - Date.now())),
        );
      }),
      connection.on("round-over", ({ winnerId }) => {
        setRoundActive(false);
        setRoundEndsAt(null);
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
      timers.forEach(clearTimeout);
      connection.close();
    };
  }, [roomName, participantName]);

  const value: GameServerState = {
    playerId,
    players,
    playerNames,
    config,
    roundActive,
    roundEndsAt,
    eliminations,
    winnerId,
    scores,
    blinkBreaks,
    lastLifeLost,
    errorMessage,
    startRound: () => connectionRef.current?.startRound(),
    setConfig: (c) => connectionRef.current?.setConfig(c),
    sendBlunk: () => connectionRef.current?.sendEyeClosed(),
    sendEyesMissing: () => connectionRef.current?.sendEyesMissing(),
    earnPowerup: () => connectionRef.current?.earnPowerup(),
    usePowerup: () => connectionRef.current?.usePowerup(),
  };

  return <GameServerContext.Provider value={value}>{children}</GameServerContext.Provider>;
}
