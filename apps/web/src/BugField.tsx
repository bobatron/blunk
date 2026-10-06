import { useEffect, useRef, useState, type RefObject } from "react";
import type { FaceSignalsDetector } from "./face-signals/FaceSignalsDetector";
import type { HuntBug } from "./game-server/context";
import { getTuning } from "./tuning";
import { toLayerPx } from "./layerMath";
import { playChomp } from "./sounds";

/** A bug on this player's screen, positioned in tile-normalized (0–1) space. */
interface Bug {
  id: number;
  x: number;
  y: number;
}

interface LocalBug extends Bug {
  angle: number;
  speed: number;
  turnAt: number;
  expiresAt: number;
}

const TICK_MS = 40;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function randomLocalBug(id: number, w: number, h: number, now: number): LocalBug {
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

/** Where a shared bug is at time `now`, interpolated along its server-sent path. */
function pointOnPath(bug: HuntBug, now: number): { x: number; y: number } | null {
  const pts = bug.path;
  if (now < pts[0].t || now > pts[pts.length - 1].t) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (now >= a.t && now <= b.t) {
      const f = (now - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return null;
}

/** One mouth-close, with the eat area it was checked against. */
export interface Chomp {
  x: number;
  y: number;
  radius: number;
  hit: boolean;
  nearest: number | null;
}

type Props = (
  | {
      mode: "local";
      active: boolean;
      detector: FaceSignalsDetector | null;
      videoRef: RefObject<HTMLVideoElement | null>;
      onEat: () => void;
    }
  | {
      mode: "shared";
      active: boolean;
      detector: FaceSignalsDetector | null;
      videoRef: RefObject<HTMLVideoElement | null>;
      bugs: HuntBug[];
      onClaim: (bugId: number) => void;
    }
) & {
  /** Reports every mouth-close with the eat radius and nearest bug, for tuning. */
  onChomp?: (chomp: Chomp) => void;
};

/**
 * Bugs on a player's face-cam. In "local" mode each player has their own
 * bugs that drift randomly and are eaten for a power-up or a solo score. In
 * "shared" mode the bugs come from the server, so everyone sees the same bug
 * in the same place, and eating one sends a claim.
 *
 * Eating is detected by the mouth closing over a bug. Fills its parent
 * (position: absolute, inset: 0).
 */
export function BugField(props: Props) {
  const { active, detector, videoRef } = props;
  const layerRef = useRef<HTMLDivElement>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const localRef = useRef<LocalBug[]>([]);
  const nextId = useRef(1);
  const mouthRef = useRef<{ x: number; y: number } | null>(null); // in layer px
  const sharedRef = useRef<HuntBug[]>([]);
  const onEatRef = useRef<(() => void) | null>(null);
  const onClaimRef = useRef<((id: number) => void) | null>(null);
  const onChompRef = useRef<((c: Chomp) => void) | undefined>(undefined);
  const modeRef = useRef(props.mode);

  // Keep the latest props visible to the timers and detector callbacks.
  useEffect(() => {
    modeRef.current = props.mode;
    onChompRef.current = props.onChomp;
    if (props.mode === "shared") {
      sharedRef.current = props.bugs;
      onClaimRef.current = props.onClaim;
    } else {
      onEatRef.current = props.onEat;
    }
  });

  useEffect(() => {
    if (!detector) return;
    const offs = [
      detector.on("mouthPosition", (p) => {
        const layer = layerRef.current;
        const video = videoRef.current;
        mouthRef.current = layer && video ? toLayerPx(layer, video, p.x, p.y) : null;
      }),
      detector.on("mouthClosed", () => {
        const mouth = mouthRef.current;
        const layer = layerRef.current;
        if (!mouth || !layer) return;
        const radius = getTuning().bugEatRadiusPx;
        const w = layer.clientWidth;
        const h = layer.clientHeight;
        const current = currentPositions(
          modeRef.current,
          localRef.current,
          sharedRef.current,
          w,
          h,
          Date.now(),
        );
        const distances = current.map((b) => ({ b, d: Math.hypot(b.x - mouth.x, b.y - mouth.y) }));
        const nearest = distances.reduce<number | null>((m, { d }) => (m === null || d < m ? d : m), null);
        const hit = distances.find(({ d }) => d < radius)?.b;
        onChompRef.current?.({ x: mouth.x, y: mouth.y, radius, hit: Boolean(hit), nearest });
        if (!hit) return;
        playChomp();
        if (modeRef.current === "shared") {
          onClaimRef.current?.(hit.id);
        } else {
          localRef.current = localRef.current.filter((b) => b.id !== hit.id);
          setBugs(localRef.current.map(({ id, x, y }) => ({ id, x, y })));
          onEatRef.current?.();
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [detector, videoRef]);

  // Local mode: spawn bugs now and then.
  useEffect(() => {
    if (!active || props.mode !== "local") {
      localRef.current = [];
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      const layer = layerRef.current;
      if (layer) {
        localRef.current = [
          ...localRef.current,
          randomLocalBug(nextId.current++, layer.clientWidth, layer.clientHeight, Date.now()),
        ];
      }
      const t = getTuning();
      timer = setTimeout(spawn, rand(t.bugSpawnMinMs, Math.max(t.bugSpawnMinMs, t.bugSpawnMaxMs)));
    };
    timer = setTimeout(spawn, getTuning().bugFirstSpawnMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, props.mode]);

  // Move and redraw on a timer: local bugs wander, shared bugs follow their path.
  useEffect(() => {
    if (!active) {
      setBugs([]);
      return;
    }
    const interval = setInterval(() => {
      const layer = layerRef.current;
      if (!layer) return;
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      const now = Date.now();
      if (modeRef.current === "local") {
        const dt = TICK_MS / 1000;
        const t = getTuning();
        localRef.current = localRef.current
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
          });
      }
      setBugs(currentPositions(modeRef.current, localRef.current, sharedRef.current, w, h, now));
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
    </div>
  );
}

/** Pixel positions of the bugs visible right now, in the current mode. */
function currentPositions(
  mode: "local" | "shared",
  local: LocalBug[],
  shared: HuntBug[],
  w: number,
  h: number,
  now: number,
): Bug[] {
  if (mode === "local") {
    return local.filter((b) => b.expiresAt > now).map(({ id, x, y }) => ({ id, x, y }));
  }
  const out: Bug[] = [];
  for (const b of shared) {
    if (b.expiresAt <= now) continue;
    const p = pointOnPath(b, now);
    if (p) out.push({ id: b.id, x: p.x * w, y: p.y * h });
  }
  return out;
}
