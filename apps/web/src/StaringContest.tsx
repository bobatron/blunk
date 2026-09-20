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
 * The in-round Staring Contest HUD: live status while a round is active,
 * and the "BLUNK!" reveal when someone's eliminated. Pre/post-round UI
 * (start button, winner, scoreboard) lives in Lobby instead.
 */
export function StaringContest() {
  const { playerId, players, roundActive, eliminations } = useGameServer();
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

  if (!roundActive && !flash) return null;

  const isEliminated = eliminations.some((e) => e.playerId === playerId);

  return (
    <div className="staring-contest-hud">
      {roundActive && (
        <p className="round-status">
          {players.length - eliminations.length} still staring
          {isEliminated && " — you're out, spectate and cheer!"}
        </p>
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
