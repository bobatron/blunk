import { useGameServer } from "./game-server/useGameServer";

/** Cumulative points across all rounds played this session, highest first. */
export function Scoreboard() {
  const { scores, playerNames } = useGameServer();
  const ranked = Object.entries(scores).sort(([, a], [, b]) => b - a);

  if (ranked.length === 0) return null;

  return (
    <div className="scoreboard">
      <h3>Scoreboard</h3>
      <ol>
        {ranked.map(([playerId, score]) => (
          <li key={playerId}>
            <span>{playerNames[playerId] ?? "Unknown"}</span>
            <span>{score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
