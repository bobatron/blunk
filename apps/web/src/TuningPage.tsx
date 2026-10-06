import { useEffect, useRef, useState } from "react";
import { DEFAULT_TUNING, resetTuning, setTuning, useTuning, type Tuning } from "./tuning";
import { useStandaloneFace } from "./useStandaloneFace";
import { BugField, type Chomp } from "./BugField";

interface Slider {
  key: keyof Tuning;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface Section {
  title: string;
  sliders: Slider[];
}

const SECTIONS: Section[] = [
  {
    title: "Blink and eyes",
    sliders: [
      { key: "blinkOn", label: "Blink closes above", min: 0.1, max: 1, step: 0.01 },
      { key: "blinkOff", label: "Blink re-opens below", min: 0.05, max: 0.8, step: 0.01 },
      { key: "winkDebounceFrames", label: "Wink hold (frames)", min: 1, max: 10, step: 1 },
      { key: "eyesWarningMs", label: "Eyes-not-visible warning after", min: 300, max: 3000, step: 100, unit: "ms" },
      { key: "eyesMissingMs", label: "Eyes-not-visible penalty after", min: 1000, max: 8000, step: 250, unit: "ms" },
    ],
  },
  {
    title: "Mouth (eating)",
    sliders: [
      { key: "mouthOn", label: "Mouth opens above", min: 0.05, max: 1, step: 0.01 },
      { key: "mouthOff", label: "Mouth closes below", min: 0.02, max: 0.8, step: 0.01 },
      { key: "tongueOn", label: "Tongue out above (blink-break)", min: 0.05, max: 1, step: 0.01 },
    ],
  },
  {
    title: "Bugs",
    sliders: [
      { key: "bugFirstSpawnMs", label: "First bug after", min: 500, max: 20000, step: 500, unit: "ms" },
      { key: "bugSpawnMinMs", label: "Next bug, shortest gap", min: 1000, max: 60000, step: 500, unit: "ms" },
      { key: "bugSpawnMaxMs", label: "Next bug, longest gap", min: 1000, max: 90000, step: 500, unit: "ms" },
      { key: "bugLifetimeMs", label: "Bug stays on screen", min: 500, max: 10000, step: 250, unit: "ms" },
      { key: "bugSpeedMin", label: "Speed, slowest", min: 20, max: 500, step: 10, unit: "px/s" },
      { key: "bugSpeedMax", label: "Speed, fastest", min: 20, max: 700, step: 10, unit: "px/s" },
      { key: "bugTurnMinMs", label: "Changes direction, shortest", min: 50, max: 2000, step: 50, unit: "ms" },
      { key: "bugTurnMaxMs", label: "Changes direction, longest", min: 50, max: 3000, step: 50, unit: "ms" },
      { key: "bugEatRadiusPx", label: "Eat radius", min: 10, max: 200, step: 2, unit: "px" },
    ],
  },
];

/**
 * Tuning panel (?tune): every client-side mechanic number, with live face
 * readings alongside so thresholds can be set against your actual face.
 * Changes apply immediately on this device and are remembered in this browser.
 */
export function TuningPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { detector, status } = useStandaloneFace(videoRef);
  const values = useTuning();
  const [copied, setCopied] = useState(false);
  const [chomp, setChomp] = useState<(Chomp & { key: number }) | null>(null);
  const chompCount = useRef(0);

  function onChomp(c: Chomp) {
    chompCount.current += 1;
    setChomp({ ...c, key: chompCount.current });
  }

  const live = useLiveScores(detector);

  function copySettings() {
    navigator.clipboard
      .writeText(JSON.stringify(values, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  }

  return (
    <div className="tuning">
      <header className="tuning-header">
        <h1>Tuning</h1>
        <a href="?game=bugs">Bug Hunt</a>
        <a href="/">Back</a>
      </header>
      <p className="hint">
        Changes apply immediately on this device and are remembered in this browser. Server-side
        values (blink-break length, default lives and timer) are not here.
      </p>

      <div className="tuning-body">
        <section className="tuning-live">
          <div className="tuning-stage">
            <video ref={videoRef} className="tuning-video" muted playsInline />
            <BugField
              mode="local"
              active
              detector={detector}
              videoRef={videoRef}
              onEat={() => undefined}
              onChomp={onChomp}
            />
            {chomp && (
              <div
                key={chomp.key}
                className={`chomp-ring ${chomp.hit ? "hit" : "miss"}`}
                style={{
                  left: chomp.x - chomp.radius,
                  top: chomp.y - chomp.radius,
                  width: chomp.radius * 2,
                  height: chomp.radius * 2,
                }}
              >
                <span className="chomp-label">
                  {chomp.hit ? "HIT" : "MISS"} · radius {Math.round(chomp.radius)}px
                  {chomp.nearest !== null && ` · nearest bug ${Math.round(chomp.nearest)}px`}
                </span>
              </div>
            )}
          </div>
          <p className="hint">{detector ? "Live face readings" : status}</p>
          <LiveBar label="eyeBlinkLeft" value={live.eyeBlinkLeft} threshold={values.blinkOn} />
          <LiveBar label="eyeBlinkRight" value={live.eyeBlinkRight} threshold={values.blinkOn} />
          <LiveBar label="jawOpen" value={live.jawOpen} threshold={values.mouthOn} />
          <LiveBar label="browOuterUp" value={live.browOuterUp} threshold={0.4} />
          <LiveBar label="tongueOut" value={live.tongueOut} threshold={values.tongueOn} />
          <div className="tuning-actions">
            <button type="button" className="join-button" onClick={copySettings}>
              {copied ? "Copied" : "Copy settings"}
            </button>
            <button type="button" className="toggle" onClick={resetTuning}>
              Reset to defaults
            </button>
          </div>
        </section>

        <section className="tuning-controls">
          {SECTIONS.map((section) => (
            <div key={section.title} className="tuning-section">
              <h2>{section.title}</h2>
              {section.sliders.map((s) => (
                <label key={s.key} className="tuning-row">
                  <span className="tuning-label">
                    {s.label}
                    {values[s.key] !== DEFAULT_TUNING[s.key] && <em> (changed)</em>}
                  </span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={values[s.key]}
                    onChange={(e) => setTuning({ [s.key]: Number(e.target.value) } as Partial<Tuning>)}
                  />
                  <output>
                    {values[s.key]}
                    {s.unit ? ` ${s.unit}` : ""}
                  </output>
                </label>
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

interface Live {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  jawOpen: number;
  browOuterUp: number;
  tongueOut: number;
}

const NO_FACE: Live = { eyeBlinkLeft: 0, eyeBlinkRight: 0, jawOpen: 0, browOuterUp: 0, tongueOut: 0 };

/** Face scores sampled at 10 Hz, so the page isn't re-rendered every frame. */
function useLiveScores(detector: { on: (e: "scores", h: (p: Live) => void) => () => void } | null): Live {
  const latest = useRef<Live>(NO_FACE);
  const [shown, setShown] = useState<Live>(NO_FACE);

  useEffect(() => {
    if (!detector) return;
    const off = detector.on("scores", (p) => {
      latest.current = p;
    });
    const id = setInterval(() => setShown(latest.current), 100);
    return () => {
      off();
      clearInterval(id);
    };
  }, [detector]);

  return shown;
}

function LiveBar({ label, value, threshold }: { label: string; value: number; threshold: number }) {
  return (
    <div className="live-row">
      <span className="live-label">{label}</span>
      <div className="live-track">
        <div className="live-fill" style={{ width: `${Math.round(value * 100)}%` }} />
        <div className="live-threshold" style={{ left: `${Math.round(threshold * 100)}%` }} />
      </div>
      <output>{value.toFixed(2)}</output>
    </div>
  );
}
