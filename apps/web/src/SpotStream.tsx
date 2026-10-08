import { useEffect, useRef, useState } from "react";
import { VideoTrack, isTrackReference, useTracks } from "@livekit/components-react";
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
 * for the whole round. Every player gets a turn as the model, one after
 * another; each round ends with a reveal before the next turn begins.
 *
 * Renders bare `VideoTrack`s rather than `ParticipantTile` everywhere here —
 * the latter draws LiveKit's own connection-quality/camera-state icons,
 * which would instantly tell judges which decoy box is actually live.
 */
export function SpotStream() {
  const { playerId, playerNames, spotStream, spotStreamResult, spotStreamFlashKey, castSpotStreamVote } =
    useGameServer();
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
  // A fresh const (not the destructured, nullable-typed one) so TS keeps the
  // non-null narrowing inside the closures below too.
  const stream = spotStream;

  const modelName = playerNames[stream.modelId] ?? "Someone";
  const isModel = playerId === stream.modelId;
  const modelTrackRef = tracks.find((t) => t.participant.identity === modelName);
  const modelTrack = modelTrackRef && isTrackReference(modelTrackRef) ? modelTrackRef : undefined;
  // Mirrored only on the model's own screen (so posing feels like looking in
  // a mirror, same as everywhere else in the app) — judges see it unmirrored,
  // same as any other remote participant.
  const mirrorModel = modelTrack?.participant.isLocal ?? false;

  const poseLeft = stream.poseEndsAt ? Math.max(0, Math.ceil((stream.poseEndsAt - now) / 1000)) : 0;
  const voteLeft = stream.votingEndsAt ? Math.max(0, Math.ceil((stream.votingEndsAt - now) / 1000)) : 0;

  function vote(i: number) {
    if (myVote !== null || isModel) return;
    setMyVote(i);
    castSpotStreamVote(i);
  }

  function renderBox(i: number) {
    if (i === stream.liveBoxIndex && modelTrack) {
      return <VideoTrack trackRef={modelTrack} className={`spot-stream-video${mirrorModel ? " mirrored" : ""}`} />;
    }
    if (stream.frame) return <img src={stream.frame} alt="" />;
    return null;
  }

  const revealLine = (() => {
    if (stream.phase !== "reveal" || !spotStreamResult) return null;
    if (spotStreamResult.awards.some((a) => a.playerId === stream.modelId)) {
      return `Nobody spotted the real stream — ${modelName} scores 5!`;
    }
    return spotStreamResult.awards.map((a) => `${playerNames[a.playerId] ?? "?"} +${a.points}`).join(" · ");
  })();

  return (
    <div className={`spot-stream${flash ? " spot-stream-flash" : ""}`}>
      {stream.phase === "posing" && (
        <div className="spot-stream-posing">
          <h2>This round's model is {modelName}!</h2>
          <p className="spot-stream-hint">
            {isModel
              ? "Pull a face or strike a pose — then hold perfectly still!"
              : `Watch closely — ${modelName} is about to freeze...`}
          </p>
          <div className="spot-stream-model-tile">
            {modelTrack ? (
              <VideoTrack trackRef={modelTrack} className={`spot-stream-video${mirrorModel ? " mirrored" : ""}`} />
            ) : (
              <div className="spot-stream-model-placeholder" />
            )}
          </div>
          <p className="spot-stream-countdown">{poseLeft}</p>
        </div>
      )}

      {(stream.phase === "voting" || stream.phase === "reveal") && (
        <div className="spot-stream-voting">
          <h2>
            {stream.phase === "reveal"
              ? revealLine ?? "Reveal!"
              : isModel
                ? "Stay still..."
                : `Which box is ${modelName}'s real feed?`}
          </h2>
          {stream.phase === "voting" && (
            <p className="spot-stream-hint">
              {voteLeft}s left · {stream.voteCount} voted
              {myVote !== null && !isModel && " · you've voted!"}
            </p>
          )}
          {stream.phase === "reveal" && isModel && (
            <p className="spot-stream-hint">That's you, highlighted below — wave to prove it!</p>
          )}
          <div
            className="spot-stream-grid"
            style={{ gridTemplateColumns: `repeat(${gridCols(stream.boxCount)}, 1fr)` }}
          >
            {Array.from({ length: stream.boxCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`spot-stream-box${myVote === i ? " voted" : ""}${
                  stream.phase === "reveal" && i === stream.liveBoxIndex ? " reveal-live" : ""
                }`}
                disabled={stream.phase === "reveal" || isModel || myVote !== null}
                onClick={() => vote(i)}
              >
                {renderBox(i)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
