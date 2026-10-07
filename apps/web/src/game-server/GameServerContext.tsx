import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { GameServerConnection } from "./GameServerConnection";
import { GAME_SERVER_URL } from "../config";
import { GameServerContext, type GameServerState } from "./context";
import { gameReducer } from "./gameReducer";
import { initialGameState } from "./gameState";

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
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  useEffect(() => {
    const connection = new GameServerConnection(GAME_SERVER_URL, roomName, participantName);
    connectionRef.current = connection;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const unsubs = [
      connection.on("joined", ({ playerId }) => dispatch({ type: "joined", playerId })),
      connection.on("lobby-state", ({ players, roundActive, config }) =>
        dispatch({ type: "lobby-state", players, roundActive, config }),
      ),
      connection.on("round-started", ({ endsAt }) => dispatch({ type: "round-started", endsAt })),
      connection.on("life-lost", ({ playerId, livesLeft, reason }) =>
        dispatch({ type: "life-lost", playerId, livesLeft, reason }),
      ),
      connection.on("photo-taken", ({ playerId }) => dispatch({ type: "photo-taken", playerId })),
      connection.on("player-eliminated", ({ playerId, place }) =>
        dispatch({ type: "player-eliminated", playerId, place }),
      ),
      connection.on("blink-break", ({ playerId, until }) => {
        dispatch({ type: "blink-break", playerId, until });
        timers.push(
          setTimeout(
            () => dispatch({ type: "blink-break-expired", playerId, until }),
            Math.max(0, until - Date.now()),
          ),
        );
      }),
      connection.on("round-over", ({ winnerId }) => dispatch({ type: "round-over", winnerId })),
      connection.on("bug-hunt-started", ({ endsAt, serverNow }) =>
        dispatch({ type: "bug-hunt-started", endsAt, serverNow, now: Date.now() }),
      ),
      connection.on("bug-spawn", ({ bug, serverNow }) =>
        dispatch({ type: "bug-spawn", bug, serverNow, now: Date.now() }),
      ),
      connection.on("bug-claimed", ({ bugId, playerId }) => dispatch({ type: "bug-claimed", bugId, playerId })),
      connection.on("bug-hunt-scores", ({ eaten }) => dispatch({ type: "bug-hunt-scores", eaten })),
      connection.on("bug-hunt-over", ({ results }) => dispatch({ type: "bug-hunt-over", results })),
      connection.on("round-snapshot", ({ playerId, image }) =>
        dispatch({ type: "round-snapshot", playerId, image }),
      ),
      connection.on("error", ({ message }) => dispatch({ type: "error", message })),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      timers.forEach(clearTimeout);
      connection.close();
    };
  }, [roomName, participantName]);

  const value: GameServerState = {
    ...state,
    dismissReel: () => dispatch({ type: "dismiss-reel" }),
    startRound: () => connectionRef.current?.startRound(),
    setConfig: (c) => connectionRef.current?.setConfig(c),
    sendBlunk: () => connectionRef.current?.sendEyeClosed(),
    sendMaskedBlink: () => connectionRef.current?.sendMaskedBlink(),
    sendEyesMissing: () => connectionRef.current?.sendEyesMissing(),
    earnPowerup: () => connectionRef.current?.earnPowerup(),
    usePowerup: () => connectionRef.current?.usePowerup(),
    startBugHunt: () => connectionRef.current?.startBugHunt(),
    claimBug: (bugId) => connectionRef.current?.claimBug(bugId),
    sendSnapshot: (image) => connectionRef.current?.sendSnapshot(image),
  };

  return <GameServerContext.Provider value={value}>{children}</GameServerContext.Provider>;
}
