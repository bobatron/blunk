import { useEffect, useState } from "react";
import { useGameServer } from "./game-server/useGameServer";

const FRAME_MS = 1200;

/**
 * The face snapshots taken when players opened their mouths during the last
 * round, looping in the lobby until the next round starts.
 */
export function MomentsReel() {
  const { reel, playerNames } = useGameServer();
  const count = reel?.items.length ?? 0;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (count === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), FRAME_MS);
    return () => clearInterval(id);
  }, [count]);

  const item = reel && count > 0 ? reel.items[index % count] : null;
  if (!item) return null;

  return (
    <div className="moments-reel">
      <h3>Mouth moments</h3>
      <img src={item.image} alt="" />
      <p>{playerNames[item.playerId] ?? "?"}</p>
    </div>
  );
}
