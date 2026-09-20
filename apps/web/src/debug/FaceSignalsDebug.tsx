import { useCallback, useEffect, useRef, useState } from "react";
import { useFaceSignals } from "../face-signals/useFaceSignals";

const BARS = [
  { key: "eyeBlinkLeft", label: "eyeBlinkLeft" },
  { key: "eyeBlinkRight", label: "eyeBlinkRight" },
  { key: "jawOpen", label: "jawOpen" },
  { key: "browOuterUp", label: "browOuterUp (avg)" },
] as const;

type ScoreKey = (typeof BARS)[number]["key"];
type Scores = Record<ScoreKey, number>;

const zeroScores: Scores = { eyeBlinkLeft: 0, eyeBlinkRight: 0, jawOpen: 0, browOuterUp: 0 };

/**
 * Dogfoods the shared face-signals module (issue #8) — also doubles as the
 * manual test harness from issue #7's spike for checking detection quality
 * on a new device/lighting setup.
 */
export function FaceSignalsDebug() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [scores, setScores] = useState<Scores>(zeroScores);
  const [events, setEvents] = useState<string[]>([]);

  const logEvent = useCallback((label: string) => {
    setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${label}`, ...prev].slice(0, 20));
  }, []);

  const { status, error } = useFaceSignals(videoRef, {
    scores: setScores,
    blink: useCallback(() => logEvent("blink"), [logEvent]),
    wink: useCallback(({ eye }: { eye: "left" | "right" }) => logEvent(`wink (${eye})`), [logEvent]),
    mouthOpen: useCallback(() => logEvent("mouthOpen"), [logEvent]),
    mouthClosed: useCallback(() => logEvent("mouthClosed"), [logEvent]),
    eyebrowRaise: useCallback(() => logEvent("eyebrowRaise"), [logEvent]),
  });

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: true }).then((s) => {
      if (cancelled) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
      setCameraReady(true);
    });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: "24px auto", padding: "0 20px", fontFamily: "monospace" }}>
      <h1>Face signals debug</h1>
      <p>
        camera: {cameraReady ? "ready" : "requesting..."} / detector: {status}
        {error && ` (${error})`}
      </p>
      <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 8 }} />
      <table style={{ width: "100%", marginTop: 16 }}>
        <tbody>
          {BARS.map(({ key, label }) => (
            <tr key={key}>
              <td>{label}</td>
              <td style={{ width: "60%" }}>
                <div style={{ background: "#eee", height: 16 }}>
                  <div
                    style={{
                      background: scores[key] > 0.4 ? "#d73a4a" : "#0e8a16",
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
      <h2>Events</h2>
      <ul>
        {events.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
