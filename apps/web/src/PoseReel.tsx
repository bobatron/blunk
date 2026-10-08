import { useEffect, useState } from "react";
import { useGameServer } from "./game-server/useGameServer";
import "./MomentsReel.css";

const FRAME_MS = 1200;

/**
 * The model's pose from every turn of the last Spot the Real Stream series,
 * looping in the lobby until the next one starts. Same look as
 * MomentsReel — kept separate since it's a different accumulator
 * (spotStreamReel, one pose per turn across a whole series, not per
 * mouth-open during a single round).
 */
export function PoseReel() {
  const { spotStreamReel, playerNames } = useGameServer();
  const count = spotStreamReel?.items.length ?? 0;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (count === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), FRAME_MS);
    return () => clearInterval(id);
  }, [count]);

  const item = spotStreamReel && count > 0 ? spotStreamReel.items[index % count] : null;
  if (!item) return null;

  return (
    <div className="moments-reel">
      <h3>Spot the Real Stream — model poses</h3>
      <img src={item.image} alt="" />
      <p>{playerNames[item.playerId] ?? "?"}</p>
    </div>
  );
}
