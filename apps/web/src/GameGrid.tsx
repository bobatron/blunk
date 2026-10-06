import { ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useGameServer } from "./game-server/useGameServer";

/**
 * Everyone in the room, always visible — including yourself — as a grid of
 * faces. Eliminated players stay on screen with a BLUNKED overlay so the rest
 * of the table can watch who's still in.
 */
export function GameGrid() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });
  const { eliminations, playerNames } = useGameServer();

  const knockedOutNames = new Set(
    eliminations.map((e) => playerNames[e.playerId]).filter((n): n is string => Boolean(n)),
  );
  const cols = Math.max(1, Math.ceil(Math.sqrt(tracks.length)));

  return (
    <div className="game-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {tracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        const knockedOut = knockedOutNames.has(identity);
        return (
          <div
            key={`${identity}-${trackRef.source}`}
            className={`grid-tile${knockedOut ? " knocked-out" : ""}`}
          >
            <ParticipantTile trackRef={trackRef} disableSpeakingIndicator />
            {knockedOut && <div className="knocked-badge">BLUNKED</div>}
          </div>
        );
      })}
    </div>
  );
}
