import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { GameServerConnection, type RoomType } from "./GameServerConnection";
import { GAME_SERVER_URL } from "../config";
import { GameServerContext, type GameServerState } from "./context";
import { gameReducer } from "./gameReducer";
import { initialGameState } from "./gameState";

export function GameServerProvider({
  roomName,
  participantName,
  roomType,
  children,
}: {
  roomName: string;
  participantName: string;
  /** Only meaningful the first time this room is created — see rooms.ts's getOrCreateRoom. */
  roomType?: RoomType;
  children: ReactNode;
}) {
  const connectionRef = useRef<GameServerConnection | null>(null);
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  useEffect(() => {
    const connection = new GameServerConnection(GAME_SERVER_URL, roomName, participantName, roomType);
    connectionRef.current = connection;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const unsubs = [
      connection.on("joined", ({ playerId }) => dispatch({ type: "joined", playerId })),
      connection.on("lobby-state", ({ players, roundActive, config, roomType }) =>
        dispatch({ type: "lobby-state", players, roundActive, config, roomType }),
      ),
      connection.on("round-countdown", ({ startsAt, serverNow }) =>
        dispatch({ type: "round-countdown", startsAt, serverNow, now: Date.now() }),
      ),
      connection.on("round-started", ({ endsAt, serverNow }) =>
        dispatch({ type: "round-started", endsAt, serverNow, now: Date.now() }),
      ),
      connection.on("life-lost", ({ playerId, livesLeft, reason }) =>
        dispatch({ type: "life-lost", playerId, livesLeft, reason }),
      ),
      connection.on("photo-taken", ({ playerId }) => dispatch({ type: "photo-taken", playerId })),
      connection.on("player-eliminated", ({ playerId, place }) =>
        dispatch({ type: "player-eliminated", playerId, place }),
      ),
      connection.on("blink-break", ({ playerId, until, serverNow }) => {
        const now = Date.now();
        // The same conversion the reducer applies, done here too so the
        // expiry timer fires at the right local-clock moment and reports
        // the same (converted) `until` the reducer actually stored — the
        // blink-break-expired guard below compares against that value.
        const localUntil = until - (serverNow - now);
        dispatch({ type: "blink-break", playerId, until, serverNow, now });
        timers.push(
          setTimeout(
            () => dispatch({ type: "blink-break-expired", playerId, until: localUntil }),
            Math.max(0, localUntil - Date.now()),
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
      connection.on("voting-started", ({ endsAt, modes, serverNow }) =>
        dispatch({ type: "voting-started", endsAt, modes, serverNow, now: Date.now() }),
      ),
      connection.on("vote-cast", ({ voteCount }) => dispatch({ type: "vote-cast", voteCount })),
      connection.on("voting-resolved", ({ mode }) => dispatch({ type: "voting-resolved", mode })),
      connection.on("spot-stream-started", ({ modelId, poseEndsAt, serverNow }) =>
        dispatch({ type: "spot-stream-started", modelId, poseEndsAt, serverNow, now: Date.now() }),
      ),
      connection.on("spot-stream-capture", () => dispatch({ type: "spot-stream-capture" })),
      connection.on("spot-stream-flash", () => dispatch({ type: "spot-stream-flash" })),
      connection.on("spot-stream-voting", ({ frame, boxCount, liveBoxIndex, votingEndsAt, serverNow }) =>
        dispatch({ type: "spot-stream-voting", frame, boxCount, liveBoxIndex, votingEndsAt, serverNow, now: Date.now() }),
      ),
      connection.on("spot-stream-vote-cast", ({ voteCount }) =>
        dispatch({ type: "spot-stream-vote-cast", voteCount }),
      ),
      connection.on("spot-stream-over", ({ modelId, liveBoxIndex, judgeVotes, awards, frame }) =>
        dispatch({ type: "spot-stream-over", modelId, liveBoxIndex, judgeVotes, awards, frame }),
      ),
      connection.on("spot-stream-voided", () => dispatch({ type: "spot-stream-voided" })),
      connection.on("spot-stream-series-over", () => dispatch({ type: "spot-stream-series-over" })),
      connection.on("error", ({ message }) => dispatch({ type: "error", message })),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      timers.forEach(clearTimeout);
      connection.close();
    };
    // roomType is only applied the moment a fresh room is created server-side —
    // it's not meant to trigger a reconnect if it somehow changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    startVoting: () => connectionRef.current?.startVoting(),
    castVote: (mode) => connectionRef.current?.castVote(mode),
    startSpotStream: () => connectionRef.current?.startSpotStream(),
    sendSpotStreamFrame: (image) => connectionRef.current?.sendSpotStreamFrame(image),
    castSpotStreamVote: (box) => connectionRef.current?.castSpotStreamVote(box),
  };

  return <GameServerContext.Provider value={value}>{children}</GameServerContext.Provider>;
}
