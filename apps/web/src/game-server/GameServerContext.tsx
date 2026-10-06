import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameServerConnection, type LobbyPlayer, type RoomConfig } from "./GameServerConnection";
import { GAME_SERVER_URL } from "../config";
import {
  GameServerContext,
  type Elimination,
  type GameServerState,
  type HuntBug,
  type LifeLostEvent,
} from "./context";

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
  const [lastPhoto, setLastPhoto] = useState<GameServerState["lastPhoto"]>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bugHunt, setBugHunt] = useState<GameServerState["bugHunt"]>(null);
  const [huntClaim, setHuntClaim] = useState<GameServerState["huntClaim"]>(null);
  const [bugHuntResults, setBugHuntResults] = useState<GameServerState["bugHuntResults"]>(null);
  const [snapshots, setSnapshots] = useState<GameServerState["snapshots"]>([]);
  const snapshotsRef = useRef<GameServerState["snapshots"]>([]);
  const [reel, setReel] = useState<GameServerState["reel"]>(null);
  const reelKey = useRef(0);
  // Server-clock to browser-clock offset, refreshed whenever the server sends a time.
  const clockOffset = useRef(0);

  useEffect(() => {
    const connection = new GameServerConnection(GAME_SERVER_URL, roomName, participantName);
    connectionRef.current = connection;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let lifeKey = 0;
    let snapshotId = 0;

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
        setReel(null);
        setRoundActive(true);
        setRoundEndsAt(endsAt);
        setEliminations([]);
        setWinnerId(undefined);
        setBlinkBreaks({});
        snapshotsRef.current = [];
        setSnapshots([]);
      }),
      connection.on("life-lost", ({ playerId, livesLeft, reason }) => {
        lifeKey += 1;
        setLastLifeLost({ playerId, livesLeft, reason, key: lifeKey });
      }),
      connection.on("photo-taken", ({ playerId }) => {
        lifeKey += 1;
        setLastPhoto({ playerId, key: lifeKey });
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
        if (snapshotsRef.current.length > 0) {
          reelKey.current += 1;
          setReel({ key: reelKey.current, items: snapshotsRef.current });
        }
        // A game has exactly one winner — that's the only point awarded.
        if (winnerId) {
          setScores((prev) => ({ ...prev, [winnerId]: (prev[winnerId] ?? 0) + 1 }));
        }
      }),
      connection.on("bug-hunt-started", ({ endsAt, serverNow }) => {
        clockOffset.current = serverNow - Date.now();
        setBugHunt({ endsAt: endsAt - clockOffset.current, eaten: {}, bugs: [] });
        setBugHuntResults(null);
        setHuntClaim(null);
      }),
      connection.on("bug-spawn", ({ bug, serverNow }) => {
        clockOffset.current = serverNow - Date.now();
        const o = clockOffset.current;
        const local: HuntBug = {
          id: bug.id,
          spawnAt: bug.spawnAt - o,
          expiresAt: bug.expiresAt - o,
          path: bug.path.map((p) => ({ ...p, t: p.t - o })),
        };
        setBugHunt((prev) => (prev ? { ...prev, bugs: [...prev.bugs, local] } : prev));
      }),
      connection.on("bug-claimed", ({ bugId, playerId }) => {
        setBugHunt((prev) => (prev ? { ...prev, bugs: prev.bugs.filter((b) => b.id !== bugId) } : prev));
        setHuntClaim({ bugId, playerId, key: Date.now() });
      }),
      connection.on("bug-hunt-scores", ({ eaten }) => {
        setBugHunt((prev) => (prev ? { ...prev, eaten } : prev));
      }),
      connection.on("bug-hunt-over", ({ results }) => {
        setBugHunt(null);
        const ranked = [...results].sort((a, b) => b.eaten - a.eaten);
        setBugHuntResults(ranked);
        // Most bugs eaten earns the point, unless it's a tie for first or nobody ate any.
        const [first, second] = ranked;
        if (first && first.eaten > 0 && (!second || second.eaten < first.eaten)) {
          setScores((prev) => ({ ...prev, [first.playerId]: (prev[first.playerId] ?? 0) + 1 }));
        }
      }),
      connection.on("round-snapshot", ({ playerId, image }) => {
        snapshotId += 1;
        const id = snapshotId;
        const item = { id, playerId, image };
        snapshotsRef.current = [...snapshotsRef.current, item];
        setSnapshots(snapshotsRef.current);
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
    lastPhoto,
    bugHunt,
    huntClaim,
    bugHuntResults,
    snapshots,
    reel,
    dismissReel: () => setReel(null),
    errorMessage,
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
