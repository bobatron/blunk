import { useEffect, useRef, useState } from "react";
import { useLocalFace } from "./localFace";
import { useGameServer } from "./game-server/useGameServer";

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

const BUG_LIFETIME_MS = 3500;
const EAT_RADIUS_PX = 60;
const TICK_MS = 40;
const SPAWN_MIN_MS = 15000;
const SPAWN_MAX_MS = 25000;
const FIRST_SPAWN_MIN_MS = 4000;
const FIRST_SPAWN_MAX_MS = 7000;

function randomBug(id: number, w: number, h: number, now: number): Bug {
  return {
    id,
    x: Math.random() * w,
    y: Math.random() * h,
    angle: Math.random() * Math.PI * 2,
    speed: 120 + Math.random() * 100,
    turnAt: now + 200 + Math.random() * 500,
    expiresAt: now + BUG_LIFETIME_MS,
  };
}

/**
 * Power-ups for your own tile: bugs dart across your face-cam in erratic
 * paths for a few seconds, and if you open and close your mouth over one, you
 * eat it and earn a power-up (currently just a blink-break). Rendered inside
 * the local grid tile.
 */
export function PowerupLayer() {
  const { detector, videoRef } = useLocalFace();
  const { roundActive, playerId, players, earnPowerup } = useGameServer();
  const me = players.find((p) => p.id === playerId);
  const alive = roundActive && (me?.lives ?? 0) > 0;

  const layerRef = useRef<HTMLDivElement>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const bugsRef = useRef(bugs);
  bugsRef.current = bugs;
  const mouthRef = useRef<{ x: number; y: number } | null>(null); // in tile px
  const nextId = useRef(1);

  // Map the normalized mouth position into tile pixels, accounting for the
  // video being object-fit: cover and mirrored for self-view.
  function toTilePx(nx: number, ny: number): { x: number; y: number } | null {
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
        mouthRef.current = toTilePx(p.x, p.y);
      }),
      detector.on("mouthClosed", () => {
        const mouth = mouthRef.current;
        if (!mouth) return;
        const hit = bugsRef.current.find(
          (b) => Math.hypot(b.x - mouth.x, b.y - mouth.y) < EAT_RADIUS_PX,
        );
        if (!hit) return;
        setBugs((prev) => prev.filter((b) => b.id !== hit.id));
        earnPowerup();
        setToast("Ate a bug: +1 Blink-break");
        setTimeout(() => setToast(null), 1500);
      }),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detector]);

  // Bugs appear now and then while the player is still in the round.
  useEffect(() => {
    if (!alive) {
      setBugs([]);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      const layer = layerRef.current;
      if (layer) {
        const bug = randomBug(nextId.current++, layer.clientWidth, layer.clientHeight, Date.now());
        setBugs((prev) => [...prev, bug]);
      }
      timer = setTimeout(spawn, SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS));
    };
    timer = setTimeout(
      spawn,
      FIRST_SPAWN_MIN_MS + Math.random() * (FIRST_SPAWN_MAX_MS - FIRST_SPAWN_MIN_MS),
    );
    return () => clearTimeout(timer);
  }, [alive]);

  // Move bugs in erratic, jittery paths, bounce off edges, and drop them on expiry.
  useEffect(() => {
    if (!alive) return;
    const interval = setInterval(() => {
      const layer = layerRef.current;
      if (!layer) return;
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      const dt = TICK_MS / 1000;
      const now = Date.now();
      setBugs((prev) =>
        prev
          .filter((b) => b.expiresAt > now)
          .map((b) => {
            let angle = b.angle;
            let turnAt = b.turnAt;
            if (now >= turnAt) {
              angle = Math.random() * Math.PI * 2;
              turnAt = now + 200 + Math.random() * 500;
            }
            const speed = b.speed * (0.6 + Math.random() * 0.8);
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
  }, [alive]);

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
