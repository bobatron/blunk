import { useEffect, useState, type RefObject } from "react";
import { FaceSignalsDetector } from "./face-signals/FaceSignalsDetector";

/**
 * Camera and face detection for the standalone pages (bug game, tuning),
 * which don't join a LiveKit room. Shows the front camera in videoRef and
 * runs the detector on the same element.
 */
export function useStandaloneFace(videoRef: RefObject<HTMLVideoElement | null>) {
  const [detector, setDetector] = useState<FaceSignalsDetector | null>(null);
  const [status, setStatus] = useState("Starting camera...");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let d: FaceSignalsDetector | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "user" } } })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play();
        d = new FaceSignalsDetector(video);
        await d.start();
        if (cancelled) return;
        setDetector(d);
        setStatus("Ready");
      })
      .catch((err: Error) => setStatus(`Camera unavailable: ${err.message}`));

    return () => {
      cancelled = true;
      d?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { detector, status };
}
