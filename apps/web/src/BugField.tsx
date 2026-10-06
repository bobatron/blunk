import { useEffect, useRef, useState, type RefObject } from "react";
import type { FaceSignalsDetector } from "./face-signals/FaceSignalsDetector";
import { getTuning } from "./tuning";

interface Bug {
  id: number;
  x: number;
  y: number;
  /** Heading in radians; changes at random intervals so the path is erratic. */
  angle: number;
  speed: number;
  turnAt: number;
  expiresAt: number;
}

const TICK_MS = 40;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function randomBug(id: number, w: number, h: number, now: number): Bug {
  const t = getTuning();
  return {
    id,
    x: Math.random() * w,
    y: Math.random() * h,
    angle: Math.random() * Math.PI * 2,
    speed: rand(t.bugSpeedMin, Math.max(t.bugSpeedMin, t.bugSpeedMax)),
    turnAt: now + rand(t.bugTurnMinMs, Math.max(t.bugTurnMinMs, t.bugTurnMaxMs)),
    expiresAt: now + t.bugLifetimeMs,
  };
}

interface Props {
  /** Bugs only appear and move while active. */
  active: boolean;
  detector: FaceSignalsDetector | null;
  /** The video whose frame the mouth position is measured against. */
  videoRef: RefObject<HTMLVideoElement | null>;
  onEat: () => void;
  eatLabel: string;
}

/**
 * Bugs drift over a face-cam, and if the player opens and closes their mouth
 * over one, it's eaten. Fills its parent (position: absolute, inset: 0).
 * Every number comes from the tuning store, so it can be dialled live.
 */
export function BugField({ active, detector, videoRef, onEat, eatLabel }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const bugsRef = useRef(bugs);
  bugsRef.current = bugs;
  const onEatRef = useRef(onEat);
  onEatRef.current = onEat;
  const mouthRef = useRef<{ x: number; y: number } | null>(null); // in layer px
  const nextId = useRef(1);

  // Map the normalized mouth position into layer pixels, accounting for the
  // video being object-fit: cover and mirrored for self-view.
  function toLayerPx(nx: number, ny: number): { x: number; y: number } | null {
    const layer = layerRef.current;
    const video = videoRef.current;
    if (!layer || !video || !video.videoWidth || !video.videoHeight) return null;
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(w / vw, h / vh);
    const ox = (w - vw * scale) / 2;
    const oy = (h - vh * scale) / 2;
    return { x: ox + (1 - nx) * vw * scale, y: oy + ny * vh * scale };
  }

  useEffect(() => {
    if (!detector) return;
    const offs = [
      detector.on("mouthPosition", (p) => {
        mouthRef.current = toLayerPx(p.x, p.y);
      }),
      detector.on("mouthClosed", () => {
        const mouth = mouthRef.current;
        if (!mouth) return;
        const radius = getTuning().bugEatRadiusPx;
        const hit = bugsRef.current.find((b) => Math.hypot(b.x - mouth.x, b.y - mouth.y) < radius);
        if (!hit) return;
        setBugs((prev) => prev.filter((b) => b.id !== hit.id));
        onEatRef.current();
        setToast(eatLabel);
        setTimeout(() => setToast(null), 1500);
      }),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detector, eatLabel]);

  // Bugs appear now and then while active.
  useEffect(() => {
    if (!active) {
      setBugs([]);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = (delay: number) => {
      timer = setTimeout(spawn, delay);
    };
    const spawn = () => {
      const layer = layerRef.current;
      if (layer) {
        const bug = randomBug(nextId.current++, layer.clientWidth, layer.clientHeight, Date.now());
        setBugs((prev) => [...prev, bug]);
      }
      const t = getTuning();
      scheduleNext(rand(t.bugSpawnMinMs, Math.max(t.bugSpawnMinMs, t.bugSpawnMaxMs)));
    };
    scheduleNext(getTuning().bugFirstSpawnMs);
    return () => clearTimeout(timer);
  }, [active]);

  // Move bugs in erratic, jittery paths, bounce off edges, and drop them on expiry.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      const layer = layerRef.current;
      if (!layer) return;
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      const dt = TICK_MS / 1000;
      const now = Date.now();
      const t = getTuning();
      setBugs((prev) =>
        prev
          .filter((b) => b.expiresAt > now)
          .map((b) => {
            let angle = b.angle;
            let turnAt = b.turnAt;
            if (now >= turnAt) {
              angle = Math.random() * Math.PI * 2;
              turnAt = now + rand(t.bugTurnMinMs, Math.max(t.bugTurnMinMs, t.bugTurnMaxMs));
            }
            const speed = b.speed * rand(0.6, 1.4);
            let x = b.x + Math.cos(angle) * speed * dt;
            let y = b.y + Math.sin(angle) * speed * dt;
            if (x < 0 || x > w) {
              angle = Math.PI - angle;
              x = Math.min(Math.max(x, 0), w);
            }
            if (y < 0 || y > h) {
              angle = -angle;
              y = Math.min(Math.max(y, 0), h);
            }
            return { ...b, x, y, angle, turnAt };
          }),
      );
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div ref={layerRef} className="powerup-layer">
      {bugs.map((b) => (
        <span key={b.id} className="powerup-bug" style={{ left: b.x, top: b.y }}>
          🐞
        </span>
      ))}
      {toast && <div className="powerup-toast">{toast}</div>}
    </div>
  );
}
