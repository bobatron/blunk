import { useEffect, useRef } from "react";
import { useGameServer } from "./game-server/useGameServer";
import { Scoreboard } from "./Scoreboard";
import { playJoin, playWinnerFanfare } from "./sounds";

const LIVES_CHOICES = [1, 2, 3, 5];
const TIME_CHOICES: { label: string; value: number | null }[] = [
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
  { label: "2 min", value: 120 },
  { label: "∞", value: null },
];

/**
 * Where players land before a round starts (and again between rounds):
 * who's here, the round settings, the running scoreboard, and the start
 * button. Settings are shared, so everyone sees the same lives and timer.
 */
export function Lobby() {
  const { players, playerNames, roundActive, winnerId, config, setConfig, startRound, errorMessage } =
    useGameServer();
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
          {winnerId === null ? (
            "Draw!"
          ) : winnerName ? (
            <>
              <span className="trophy">🏆</span> {winnerName} wins!
            </>
          ) : (
            "Round over."
          )}
        </p>
      )}
      <Scoreboard />
      <div className="lobby-settings">
        <div className="setting-group">
          <h3>Lives</h3>
          <div className="choice-row">
            {LIVES_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                className={`choice${config.lives === n ? " selected" : ""}`}
                onClick={() => setConfig({ ...config, lives: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-group">
          <h3>Timer</h3>
          <div className="choice-row">
            {TIME_CHOICES.map((t) => (
              <button
                key={t.label}
                type="button"
                className={`choice${config.timeLimitSec === t.value ? " selected" : ""}`}
                onClick={() => setConfig({ ...config, timeLimitSec: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
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
        Start round
      </button>
      {!canStart && <p className="hint">Waiting for at least 2 players to join...</p>}
    </div>
  );
}
