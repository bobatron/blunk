import { useLocalFace } from "./localFace";
import { useGameServer } from "./game-server/useGameServer";
import { BugField } from "./BugField";

/**
 * Power-ups on your own tile: bugs drift over your face-cam, and eating one
 * earns a power-up (currently a blink-break). Only while you're still in.
 */
export function PowerupLayer() {
  const { detector, videoRef } = useLocalFace();
  const { roundActive, playerId, players, earnPowerup } = useGameServer();
  const me = players.find((p) => p.id === playerId);
  const alive = roundActive && (me?.lives ?? 0) > 0;

  return (
    <BugField
      active={alive}
      detector={detector}
      videoRef={videoRef}
      onEat={earnPowerup}
      eatLabel="Ate a bug: +1 Blink-break"
    />
  );
}
