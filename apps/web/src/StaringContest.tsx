import { useEffect, useState } from "react";
import { useGameServer } from "./game-server/useGameServer";

function playBlunkSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    // audio isn't essential — ignore if it fails (autoplay policy, etc.)
  }
}

/**
 * The Staring Contest HUD: start/replay controls, live round status, and
 * the "BLUNK!" reveal when someone's eliminated. Rendered as an overlay on
 * top of the LiveKit VideoConference.
 */
export function StaringContest() {
  const { playerId, players, roundActive, eliminations, winnerId, startRound, errorMessage } =
    useGameServer();
  const [flash, setFlash] = useState<{ name: string; key: number } | null>(null);

  useEffect(() => {
    if (eliminations.length === 0) return;
    const last = eliminations[eliminations.length - 1];
    const name = players.find((p) => p.id === last.playerId)?.name ?? "Someone";
    setFlash({ name, key: Date.now() });
    playBlunkSound();
    const timer = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(timer);
    // Only fire when a new elimination is appended, not on every players change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eliminations]);

  const isEliminated = eliminations.some((e) => e.playerId === playerId);
  const winnerName = winnerId ? players.find((p) => p.id === winnerId)?.name : null;
  const roundHasFinished = winnerId !== undefined;

  return (
    <div className="staring-contest-hud">
      {!roundActive && !roundHasFinished && (
        <button onClick={startRound}>Start Staring Contest ({players.length} players)</button>
      )}
      {errorMessage && <p className="error">{errorMessage}</p>}
      {roundActive && (
        <p className="round-status">
          {players.length - eliminations.length} still staring
          {isEliminated && " — you're out, spectate and cheer!"}
        </p>
      )}
      {roundHasFinished && !roundActive && (
        <div className="winner-banner">
          <h2>{winnerName ? `${winnerName} wins!` : "Round over"}</h2>
          <button onClick={startRound}>Play again</button>
        </div>
      )}
      {flash && (
        <div key={flash.key} className="blunk-flash">
          <div className="blunk-stamp">BLUNK!</div>
          <div className="blunk-name">{flash.name}</div>
        </div>
      )}
    </div>
  );
}
