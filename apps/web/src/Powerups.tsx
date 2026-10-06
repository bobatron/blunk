import { useEffect, useState } from "react";
import { useLocalFace } from "./localFace";
import { useGameServer } from "./game-server/useGameServer";
import { BugField } from "./BugField";

/**
 * Bugs on your own tile. During a lobby Bug Hunt, bugs are shared and eating
 * one claims it for the room. During a round, eating a local bug earns a
 * power-up, and only while you're still in.
 */
export function PowerupLayer() {
  const { detector, videoRef } = useLocalFace();
  const { roundActive, playerId, players, earnPowerup, bugHunt, huntClaim, claimBug } = useGameServer();
  const me = players.find((p) => p.id === playerId);
  const alive = roundActive && (me?.lives ?? 0) > 0;
  const hunting = bugHunt !== null;
  const [eatCount, setEatCount] = useState(0);

  return (
    <>
      {hunting ? (
        <BugField
          mode="shared"
          active
          detector={detector}
          videoRef={videoRef}
          bugs={bugHunt.bugs}
          onClaim={claimBug}
        />
      ) : (
        <BugField
          mode="local"
          active={alive}
          detector={detector}
          videoRef={videoRef}
          onEat={() => {
            earnPowerup();
            setEatCount((c) => c + 1);
          }}
        />
      )}
      {eatCount > 0 && !hunting && <Toast key={eatCount} text="Ate a bug: +1 Blink-break" />}
      {hunting && huntClaim?.playerId === playerId && (
        <Toast key={huntClaim.key} text="Bug eaten!" />
      )}
    </>
  );
}

function Toast({ text }: { text: string }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 1200);
    return () => clearTimeout(id);
  }, []);
  return show ? <div className="powerup-toast">{text}</div> : null;
}
