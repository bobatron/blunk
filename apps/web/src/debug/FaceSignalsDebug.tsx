import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const TRACKED = [
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "jawOpen",
  "browOuterUpLeft",
  "browOuterUpRight",
] as const;

const BLINK_ON_THRESHOLD = 0.5;
const BLINK_OFF_THRESHOLD = 0.3;

type Scores = Record<(typeof TRACKED)[number], number>;

const zeroScores: Scores = {
  eyeBlinkLeft: 0,
  eyeBlinkRight: 0,
  jawOpen: 0,
  browOuterUpLeft: 0,
  browOuterUpRight: 0,
};

/**
 * Spike for issue #7: is MediaPipe's blendshape output reliable enough to
 * skip hand-rolled EAR/MAR math? Blink a deliberate number of times and
 * check the counter matches, across a couple of devices/lighting setups.
 */
export function FaceSignalsDebug() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scores, setScores] = useState<Scores>(zeroScores);
  const [blinkCount, setBlinkCount] = useState(0);
  const [status, setStatus] = useState("Requesting camera...");

  useEffect(() => {
    let cancelled = false;
    let rafId: number;
    let landmarker: FaceLandmarker | null = null;
    let stream: MediaStream | null = null;
    let eyesClosed = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        setStatus("Loading face model...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
        );
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) return;
        setStatus("Running");

        const loop = () => {
          if (cancelled || !landmarker || !video) return;
          const result = landmarker.detectForVideo(video, performance.now());
          const categories = result.faceBlendshapes[0]?.categories;
          if (categories) {
            const next = { ...zeroScores };
            for (const cat of categories) {
              if ((TRACKED as readonly string[]).includes(cat.categoryName)) {
                next[cat.categoryName as keyof Scores] = cat.score;
              }
            }
            setScores(next);

            const bothClosed =
              next.eyeBlinkLeft > BLINK_ON_THRESHOLD && next.eyeBlinkRight > BLINK_ON_THRESHOLD;
            const bothOpen =
              next.eyeBlinkLeft < BLINK_OFF_THRESHOLD && next.eyeBlinkRight < BLINK_OFF_THRESHOLD;
            if (bothClosed && !eyesClosed) {
              eyesClosed = true;
              setBlinkCount((c) => c + 1);
            } else if (bothOpen && eyesClosed) {
              eyesClosed = false;
            }
          }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        if (!cancelled) setStatus(`Error: ${(err as Error).message}`);
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      landmarker?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: "24px auto", padding: "0 20px", fontFamily: "monospace" }}>
      <h1>Face signals debug</h1>
      <p>{status}</p>
      <p>
        Blink deliberately a few times and check this matches: <strong>{blinkCount}</strong>{" "}
        {blinkCount !== 1 ? "blinks" : "blink"} detected
        {" "}
        <button onClick={() => setBlinkCount(0)}>reset</button>
      </p>
      <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 8 }} />
      <table style={{ width: "100%", marginTop: 16 }}>
        <tbody>
          {TRACKED.map((key) => (
            <tr key={key}>
              <td>{key}</td>
              <td style={{ width: "60%" }}>
                <div style={{ background: "#eee", height: 16 }}>
                  <div
                    style={{
                      background: scores[key] > BLINK_ON_THRESHOLD ? "#d73a4a" : "#0e8a16",
                      width: `${Math.round(scores[key] * 100)}%`,
                      height: "100%",
                    }}
                  />
                </div>
              </td>
              <td>{scores[key].toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
