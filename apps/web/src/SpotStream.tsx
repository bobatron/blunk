import { useEffect, useRef, useState } from "react";
import { ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useGameServer } from "./game-server/useGameServer";
import { playCamera } from "./sounds";
import "./SpotStream.css";

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Column count that keeps a grid of `count` boxes roughly square. */
function gridCols(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

/**
 * Spot the Real Stream: the model poses, the flash goes off, and their
 * frozen face is split across a grid of decoy boxes with exactly one box
 * left live — judges tap the box they think is the real feed before the
 * model gives themselves away by moving. Replaces the normal camera grid
 * for the whole round; the reveal is shown back in the lobby afterwards.
 */
export function SpotStream() {
  const { playerId, playerNames, spotStream, spotStreamFlashKey, castSpotStreamVote } = useGameServer();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const now = useNow(200);
  // Reset for a new round by the parent keying this component on modelId —
  // simpler than an effect, and it resets the flash tracking below too.
  const [myVote, setMyVote] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const seenFlashKey = useRef(spotStreamFlashKey);

  useEffect(() => {
    if (spotStreamFlashKey === seenFlashKey.current) return;
    seenFlashKey.current = spotStreamFlashKey;
    playCamera();
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 350);
    return () => clearTimeout(timer);
  }, [spotStreamFlashKey]);

  if (!spotStream) return null;

  const modelName = playerNames[spotStream.modelId] ?? "Someone";
  const isModel = playerId === spotStream.modelId;
  const modelTrack = tracks.find((t) => t.participant.identity === modelName);

  const poseLeft = spotStream.poseEndsAt ? Math.max(0, Math.ceil((spotStream.poseEndsAt - now) / 1000)) : 0;
  const voteLeft = spotStream.votingEndsAt ? Math.max(0, Math.ceil((spotStream.votingEndsAt - now) / 1000)) : 0;

  function vote(i: number) {
    if (myVote !== null || isModel) return;
    setMyVote(i);
    castSpotStreamVote(i);
  }

  return (
    <div className={`spot-stream${flash ? " spot-stream-flash" : ""}`}>
      {spotStream.phase === "posing" && (
        <div className="spot-stream-posing">
          <h2>This round's model is {modelName}!</h2>
          <p className="spot-stream-hint">
            {isModel
              ? "Pull a face or strike a pose — then hold perfectly still!"
              : `Watch closely — ${modelName} is about to freeze...`}
          </p>
          <div className="spot-stream-model-tile">
            {modelTrack ? (
              <ParticipantTile trackRef={modelTrack} disableSpeakingIndicator />
            ) : (
              <div className="spot-stream-model-placeholder" />
            )}
          </div>
          <p className="spot-stream-countdown">{poseLeft}</p>
        </div>
      )}

      {spotStream.phase === "voting" && (
        <div className="spot-stream-voting">
          <h2>{isModel ? "Stay still..." : `Which box is ${modelName}'s real feed?`}</h2>
          <p className="spot-stream-hint">
            {voteLeft}s left · {spotStream.voteCount} voted
            {myVote !== null && !isModel && " · you've voted!"}
          </p>
          <div
            className="spot-stream-grid"
            style={{ gridTemplateColumns: `repeat(${gridCols(spotStream.boxCount)}, 1fr)` }}
          >
            {Array.from({ length: spotStream.boxCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`spot-stream-box${myVote === i ? " voted" : ""}`}
                disabled={isModel || myVote !== null}
                onClick={() => vote(i)}
              >
                {i === spotStream.liveBoxIndex && modelTrack ? (
                  <ParticipantTile trackRef={modelTrack} disableSpeakingIndicator />
                ) : spotStream.frame ? (
                  <img src={spotStream.frame} alt="" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
