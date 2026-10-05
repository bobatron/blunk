import { useEffect, useRef, useState } from "react";
import { useGameServer } from "./game-server/useGameServer";
import { playBlunk, playRoundStart } from "./sounds";

/**
 * The in-round Staring Contest HUD: live status while a round is active,
 * and the "BLUNK!" reveal when someone's eliminated. Pre/post-round UI
 * (start button, winner, scoreboard) lives in Lobby instead.
 */
export function StaringContest() {
  const { playerId, players, roundActive, eliminations } = useGameServer();
  const [flash, setFlash] = useState<{ name: string; key: number } | null>(null);
  const wasRoundActive = useRef(false);

  useEffect(() => {
    if (roundActive && !wasRoundActive.current) playRoundStart();
    wasRoundActive.current = roundActive;
  }, [roundActive]);

  useEffect(() => {
    if (eliminations.length === 0) return;
    const last = eliminations[eliminations.length - 1];
    const name = players.find((p) => p.id === last.playerId)?.name ?? "Someone";
    setFlash({ name, key: Date.now() });
    playBlunk();
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
