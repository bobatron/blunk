import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { FaceSignalsDetector } from "./face-signals/FaceSignalsDetector";
import { useGameServer } from "./game-server/useGameServer";
import { LocalFaceContext } from "./localFace";
import { captureFace } from "./captureFace";

/**
 * Runs face detection on the local participant's own camera feed and reports
 * to the game server: eye closures (a life lost on blink) and eyes not visible
 * for too long (a life lost, with a warning first). Exposes the detector to
 * children (e.g. power-ups) via context.
 *
 * Camera feed comes from LiveKit's local video track, piped into a hidden
 * <video> since the grid tiles don't expose the raw element.
 */
export function LocalFaceSignals({ children }: { children: ReactNode }) {
  const { cameraTrack } = useLocalParticipant();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [detector, setDetector] = useState<FaceSignalsDetector | null>(null);
  const [eyesWarning, setEyesWarning] = useState(false);
  const maskRef = useRef(false);
  const game = useGameServer();

  // Latest game state for detector callbacks, which are registered once.
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  });

  useEffect(() => {
    const track = cameraTrack?.track;
    const video = videoRef.current;
    if (!track || !video) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [cameraTrack]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const d = new FaceSignalsDetector(video);
    const isOut = () => {
      const g = gameRef.current;
      return !g.roundActive || !(g.players.find((p) => p.id === g.playerId)?.lives ?? 0);
    };
    const offs = [
      d.on("eyeClosed", () => {
        if (isOut()) return;
        // Eyes behind sunglasses are a photo, not a blink.
        if (maskRef.current) gameRef.current.sendMaskedBlink();
        else gameRef.current.sendBlunk();
      }),
      d.on("pucker", () => {
        const g = gameRef.current;
        const me = g.players.find((p) => p.id === g.playerId);
        if (g.roundActive && (me?.lives ?? 0) > 0 && (me?.powerups ?? 0) > 0) g.usePowerup();
      }),
      d.on("eyesWarning", () => setEyesWarning(true)),
      d.on("eyesFound", () => setEyesWarning(false)),
      d.on("mouthOpen", () => {
        const g = gameRef.current;
        const alive = (g.players.find((p) => p.id === g.playerId)?.lives ?? 0) > 0;
        if (!g.roundActive || !alive) return;
        const video = videoRef.current;
        const image = video ? captureFace(video) : null;
        if (image) g.sendSnapshot(image);
      }),
      d.on("eyesMissing", () => {
        if (!isOut()) gameRef.current.sendEyesMissing();
      }),
    ];
    d.start()
      .then(() => setDetector(d))
      .catch(() => setEyesWarning(false));
    return () => {
      offs.forEach((off) => off());
      d.stop();
    };
  }, []);

  return (
    <LocalFaceContext.Provider value={{ detector, videoRef, maskRef }}>
      <video ref={videoRef} muted playsInline style={{ display: "none" }} />
      {children}
      {eyesWarning && game.roundActive && (
        <div className="eyes-warning" role="alert">
          Eyes not detected! Show your eyes or you'll lose a life.
        </div>
      )}
    </LocalFaceContext.Provider>
  );
}
