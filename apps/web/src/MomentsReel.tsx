import { useEffect, useState } from "react";
import { useGameServer } from "./game-server/useGameServer";

const FRAME_MS = 1200;

type Reel = NonNullable<ReturnType<typeof useGameServer>["reel"]>;

/**
 * End-of-round slideshow of the face snapshots taken when players opened
 * their mouths near a bug. Plays once, then clears.
 */
export function MomentsReel() {
  const { reel } = useGameServer();
  if (!reel) return null;
  return <Slideshow key={reel.key} reel={reel} />;
}

function Slideshow({ reel }: { reel: Reel }) {
  const { dismissReel, playerNames } = useGameServer();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => i + 1), FRAME_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (index >= reel.items.length) dismissReel();
  }, [index, reel.items.length, dismissReel]);

  const item = reel.items[index];
  if (!item) return null;

  return (
    <div className="moments-reel" role="status">
      <h2>Mouth moments</h2>
      <img src={item.image} alt="" />
      <p>{playerNames[item.playerId] ?? "?"}</p>
    </div>
  );
}
