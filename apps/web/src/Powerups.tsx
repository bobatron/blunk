import { useLocalFace } from "./localFace";
import { useGameServer } from "./game-server/useGameServer";
import { BugField } from "./BugField";
import { captureFace } from "./captureFace";

/**
 * Bugs on your own tile. During a round, eating one earns a power-up and
 * opening your mouth near one takes a face snapshot for the end-of-round
 * gallery. During a lobby Bug Hunt, every eaten bug counts toward your score.
 */
export function PowerupLayer() {
  const { detector, videoRef } = useLocalFace();
  const { roundActive, playerId, players, earnPowerup, bugHunt, bugEaten, sendSnapshot } =
    useGameServer();
  const me = players.find((p) => p.id === playerId);
  const alive = roundActive && (me?.lives ?? 0) > 0;
  const hunting = bugHunt !== null;

  return (
    <BugField
      active={alive || hunting}
      detector={detector}
      videoRef={videoRef}
      onEat={hunting ? bugEaten : earnPowerup}
      eatLabel={hunting ? "Bug eaten!" : "Ate a bug: +1 Blink-break"}
      onMouthOpenNearBug={
        alive
          ? () => {
              const video = videoRef.current;
              const image = video ? captureFace(video) : null;
              if (image) sendSnapshot(image);
            }
          : undefined
      }
    />
  );
}
