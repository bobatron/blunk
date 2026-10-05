import { useEffect, useRef } from "react";
import { useGameServer } from "./game-server/useGameServer";
import { Scoreboard } from "./Scoreboard";
import { playJoin, playWinnerFanfare } from "./sounds";

/**
 * Where players land before a round starts (and again between rounds):
 * who's here, the running scoreboard, and the choice of what to play next.
 * Only one mode exists so far, so "choice" is just a single start button —
 * this becomes real mode-voting once a second mode exists (issue #10).
 */
export function Lobby() {
  const { players, playerNames, roundActive, winnerId, startRound, errorMessage } = useGameServer();
  const prevPlayerCount = useRef<number | null>(null);
  const announcedWinner = useRef<string | null>(null);

  useEffect(() => {
    if (prevPlayerCount.current !== null && players.length > prevPlayerCount.current) playJoin();
    prevPlayerCount.current = players.length;
  }, [players.length]);

  useEffect(() => {
    if (winnerId && winnerId !== announcedWinner.current) {
      playWinnerFanfare();
      announcedWinner.current = winnerId;
    }
  }, [winnerId]);

  if (roundActive) return null;

  const hasPlayedARound = winnerId !== undefined;
  const winnerName = winnerId ? playerNames[winnerId] : null;
  const canStart = players.length >= 2;

  return (
    <div className="lobby">
      <h2>Lobby</h2>
      {hasPlayedARound && (
        <p className="last-winner">
          {winnerName ? (
            <>
              <span className="trophy">🏆</span> {winnerName} wins!
            </>
          ) : (
            "Round over."
          )}
        </p>
      )}
      <Scoreboard />
      <div className="lobby-players">
        <h3>Players ({players.length})</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
      {errorMessage && <p className="error">{errorMessage}</p>}
      <button onClick={startRound} disabled={!canStart}>
        Next game: Staring Contest
      </button>
      {!canStart && <p className="hint">Waiting for at least 2 players to join...</p>}
    </div>
  );
}
