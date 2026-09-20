import { useCallback, useEffect, useRef } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { useFaceSignals } from "./face-signals/useFaceSignals";
import { useGameServer } from "./game-server/useGameServer";

/**
 * Runs blink detection against the local participant's own camera feed
 * (piped from LiveKit's local video track into a hidden <video>, since the
 * prebuilt VideoConference UI doesn't expose the raw element) and reports
 * blinks to the game-server while a round is active. Renders nothing.
 */
export function LocalFaceSignals() {
  const { cameraTrack } = useLocalParticipant();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { playerId, roundActive, eliminations, sendBlunk } = useGameServer();

  useEffect(() => {
    const track = cameraTrack?.track;
    const video = videoRef.current;
    if (!track || !video) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [cameraTrack]);

  const isEliminated = eliminations.some((e) => e.playerId === playerId);

  const handleBlink = useCallback(() => {
    if (roundActive && !isEliminated) sendBlunk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundActive, isEliminated]);

  useFaceSignals(videoRef, { blink: handleBlink });

  return <video ref={videoRef} muted playsInline style={{ display: "none" }} />;
}
