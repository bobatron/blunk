import { useEffect, useRef, useState } from "react";
import { BugField } from "./BugField";
import { useStandaloneFace } from "./useStandaloneFace";

const ROUND_SECONDS = 60;

/**
 * Solo Bug Hunt: eat as many bugs as you can in 60 seconds, with no room or
 * server involved. Open and close your mouth over a bug to eat it. Tune the
 * bug mechanics on the tuning page (?tune) and try them here.
 */
export function BugGame() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { detector, status } = useStandaloneFace(videoRef);
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [eaten, setEaten] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const best = useBest();

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && secondsLeft === 0) setPhase("done");
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase === "done") best.record(eaten);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function start() {
    setEaten(0);
    setSecondsLeft(ROUND_SECONDS);
    setPhase("playing");
  }

  return (
    <div className="bug-game">
      <div className="bug-stage">
        <video ref={videoRef} className="bug-video" muted playsInline />
        <BugField
          mode="local"
          active={phase === "playing"}
          detector={detector}
          videoRef={videoRef}
          onEat={() => setEaten((n) => n + 1)}
        />
      </div>
      <div className="bug-hud">
        <div className="bug-stats">
          <span>Eaten: <strong>{eaten}</strong></span>
          <span>Time: <strong>{secondsLeft}s</strong></span>
          {best.value !== null && <span>Best: <strong>{best.value}</strong></span>}
        </div>
        {phase === "ready" && <p className="hint">{detector ? "Open and close your mouth over a bug to eat it." : status}</p>}
        {phase === "done" && <p className="bug-final">Round over — you ate {eaten}!</p>}
        <div className="bug-actions">
          <button type="button" className="join-button" disabled={!detector || phase === "playing"} onClick={start}>
            {phase === "done" ? "Play again" : "Start"}
          </button>
          <a className="bug-link" href="?tune">Tuning</a>
          <a className="bug-link" href="/">Back</a>
        </div>
      </div>
    </div>
  );
}

const BEST_KEY = "blunk-bug-best";

function useBest() {
  const [value, setValue] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      return raw === null ? null : Number(raw);
    } catch {
      return null;
    }
  });
  return {
    value,
    record(score: number) {
      setValue((prev) => {
        const next = prev === null ? score : Math.max(prev, score);
        try {
          localStorage.setItem(BEST_KEY, String(next));
        } catch {
          // storage unavailable — keep the score for this session only
        }
        return next;
      });
    },
  };
}
