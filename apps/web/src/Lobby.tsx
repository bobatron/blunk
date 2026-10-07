import { useEffect, useRef, useState } from "react";
import { useGameServer } from "./game-server/useGameServer";
import type { ModeKey } from "./game-server/GameServerConnection";
import { Scoreboard } from "./Scoreboard";
import { playJoin, playWinnerFanfare } from "./sounds";
import { MomentsReel } from "./MomentsReel";
import "./Lobby.css";

const LIVES_CHOICES = [1, 2, 3, 5];
const TIME_CHOICES: { label: string; value: number | null }[] = [
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
  { label: "2 min", value: 120 },
  { label: "∞", value: null },
];

const MODE_LABELS: Record<ModeKey, string> = {
  staring: "Staring Contest",
  "bug-hunt": "Bug Hunt",
  "spot-stream": "Spot the Real Stream",
};

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** The mode buttons for an in-progress vote. A separate component, keyed by
 * vote.endsAt from the parent, so a new vote remounts it with fresh local
 * state instead of needing an effect to reset it. */
function VoteChoices({
  modes,
  endsAt,
  voteCount,
  playerCount,
  castVote,
}: {
  modes: ModeKey[];
  endsAt: number;
  voteCount: number;
  playerCount: number;
  castVote: (mode: ModeKey) => void;
}) {
  const now = useNow(250);
  const [myVote, setMyVote] = useState<ModeKey | null>(null);
  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));

  return (
    <>
      <h3>What's next?</h3>
      <p className="hint">
        {secondsLeft}s left · {voteCount}/{playerCount} voted
      </p>
      <div className="choice-row">
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            className={`choice${myVote === mode ? " selected" : ""}`}
            onClick={() => {
              setMyVote(mode);
              castVote(mode);
            }}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Where players land before a round starts (and again between rounds):
 * who's here, the round settings, the running scoreboard, and the start
 * button. Settings are shared, so everyone sees the same lives and timer.
 */
export function Lobby() {
  const {
    players,
    playerNames,
    roomType,
    roundActive,
    winnerId,
    config,
    setConfig,
    startRound,
    errorMessage,
    bugHunt,
    bugHuntResults,
    startBugHunt,
    spotStream,
    spotStreamResult,
    startSpotStream,
    vote,
    votingResolvedMode,
    startVoting,
    castVote,
  } = useGameServer();
  const now = useNow(250);
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

  if (roundActive || spotStream) return null;

  const hasPlayedARound = winnerId !== undefined;
  const winnerName = winnerId ? playerNames[winnerId] : null;
  const canStart = players.length >= 2;
  const isRandom = roomType === "random";

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
      {spotStreamResult && (
        <div className="spot-stream-reveal">
          <h3>Spot the Real Stream — reveal!</h3>
          <p>
            {playerNames[spotStreamResult.modelId] ?? "The model"}'s real feed was box{" "}
            {spotStreamResult.liveBoxIndex + 1}.
          </p>
          {spotStreamResult.awards.length > 0 ? (
            <p className="hunt-results">
              {spotStreamResult.awards
                .map((a) => `${playerNames[a.playerId] ?? "?"} +${a.points}`)
                .join(" · ")}
            </p>
          ) : (
            <p className="hint">Nobody scored.</p>
          )}
        </div>
      )}

      {isRandom ? (
        <div className="lobby-vote">
          {votingResolvedMode && !vote && (
            <p className="vote-resolved">{MODE_LABELS[votingResolvedMode]} won the vote!</p>
          )}
          {vote ? (
            <VoteChoices
              key={vote.endsAt}
              modes={vote.modes}
              endsAt={vote.endsAt}
              voteCount={vote.voteCount}
              playerCount={players.length}
              castVote={castVote}
            />
          ) : (
            <>
              <button type="button" onClick={startVoting} disabled={!canStart}>
                Start the vote
              </button>
              {!canStart && <p className="hint">Waiting for at least 2 players to join...</p>}
            </>
          )}
        </div>
      ) : (
        <>
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
          <div className="lobby-bughunt">
            <h3>Bug Hunt</h3>
            {bugHunt ? (
              <>
                <p className="hunt-time">
                  {Math.max(0, Math.ceil((bugHunt.endsAt - now) / 1000))}s left, eat bugs!
                </p>
                <ul className="hunt-scores">
                  {players.map((p) => (
                    <li key={p.id}>
                      {p.name}: <strong>{bugHunt.eaten[p.id] ?? 0}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                {bugHuntResults && (
                  <p className="hunt-results">
                    {bugHuntResults.map((r) => `${playerNames[r.playerId] ?? "?"} ${r.eaten}`).join(" · ")}
                  </p>
                )}
                <button type="button" onClick={startBugHunt}>
                  Play Bug Hunt (60s)
                </button>
                <button type="button" onClick={startSpotStream}>
                  Play Spot the Real Stream
                </button>
              </>
            )}
          </div>
        </>
      )}

      <MomentsReel />
      <div className="lobby-players">
        <h3>Players ({players.length})</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
      {errorMessage && <p className="error">{errorMessage}</p>}
      {!isRandom && (
        <>
          <button onClick={startRound} disabled={!canStart}>
            Start round
          </button>
          {!canStart && <p className="hint">Waiting for at least 2 players to join...</p>}
        </>
      )}
    </div>
  );
}
