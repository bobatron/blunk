import { useEffect, useRef, useState } from "react";
import { useLocalFace } from "./localFace";
import { toLayerPx } from "./layerMath";
import { useGameServer } from "./game-server/useGameServer";

// Glasses size and eye-cover tolerance, in normalized (0–1) video coordinates.
const GLASSES_W = 0.36;
const GLASSES_H = 0.13;
const COVER_SLACK = 0.9;
const LIFETIME_MS = 5000;
const SPEED = 0.25;
const TICK_MS = 40;
const FIRST_MIN_MS = 8000;
const FIRST_MAX_MS = 14000;
const GAP_MIN_MS = 18000;
const GAP_MAX_MS = 30000;

interface Glasses {
  x: number;
  y: number;
  angle: number;
  turnAt: number;
  expiresAt: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function covers(eye: { x: number; y: number }, g: Glasses) {
  return (
    Math.abs(eye.x - g.x) < (GLASSES_W / 2) * COVER_SLACK &&
    Math.abs(eye.y - g.y) < (GLASSES_H / 2) * COVER_SLACK
  );
}

/**
 * A pair of sunglasses drifts over your face. Holding your eyes behind them
 * and blinking takes a photo: everyone else still in the round loses a life.
 * The masked state is written to maskRef so the blink handler can tell a
 * photo from a normal blink.
 */
export function Sunglasses() {
  const { detector, videoRef, maskRef } = useLocalFace();
  const { roundActive, playerId, players } = useGameServer();
  const me = players.find((p) => p.id === playerId);
  const alive = roundActive && (me?.lives ?? 0) > 0;

  const layerRef = useRef<HTMLDivElement>(null);
  const [sprite, setSprite] = useState<{ left: number; top: number; size: number } | null>(null);
  const glassesRef = useRef<Glasses | null>(null);

  // Keep the current glasses and eye positions in step, and set the mask flag.
  useEffect(() => {
    if (!detector) return;
    const off = detector.on("eyePositions", (eyes) => {
      const g = glassesRef.current;
      maskRef.current = Boolean(g && covers(eyes.left, g) && covers(eyes.right, g));
    });
    return () => {
      off();
      maskRef.current = false;
    };
  }, [detector, maskRef]);

  // Glasses appear now and then while alive.
  useEffect(() => {
    if (!alive) {
      glassesRef.current = null;
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      const now = Date.now();
      const g: Glasses = {
        x: rand(0.25, 0.75),
        y: rand(0.25, 0.75),
        angle: rand(0, Math.PI * 2),
        turnAt: now + rand(400, 1000),
        expiresAt: now + LIFETIME_MS,
      };
      glassesRef.current = g;
      timer = setTimeout(spawn, rand(GAP_MIN_MS, GAP_MAX_MS));
    };
    timer = setTimeout(spawn, rand(FIRST_MIN_MS, FIRST_MAX_MS));
    return () => clearTimeout(timer);
  }, [alive]);

  // Drift the glasses around the face and redraw.
  useEffect(() => {
    if (!alive) return;
    const id = setInterval(() => {
      const now = Date.now();
      const g = glassesRef.current;
      if (g && g.expiresAt <= now) {
        glassesRef.current = null;
        maskRef.current = false;
      }
      const cur = glassesRef.current;
      if (cur) {
        const dt = TICK_MS / 1000;
        let angle = cur.angle;
        let turnAt = cur.turnAt;
        if (now >= turnAt) {
          angle = rand(0, Math.PI * 2);
          turnAt = now + rand(400, 1000);
        }
        let x = cur.x + Math.cos(angle) * SPEED * dt;
        let y = cur.y + Math.sin(angle) * SPEED * dt;
        if (x < 0.15 || x > 0.85) {
          angle = Math.PI - angle;
          x = Math.min(Math.max(x, 0.15), 0.85);
        }
        if (y < 0.2 || y > 0.8) {
          angle = -angle;
          y = Math.min(Math.max(y, 0.2), 0.8);
        }
        glassesRef.current = { ...cur, x, y, angle, turnAt };
      }
      const layer = layerRef.current;
      const video = videoRef.current;
      const gNow = glassesRef.current;
      if (!gNow || !layer || !video || !video.videoWidth) {
        setSprite(null);
        return;
      }
      const center = toLayerPx(layer, video, gNow.x, gNow.y);
      if (!center) return;
      const scale = Math.max(layer.clientWidth / video.videoWidth, layer.clientHeight / video.videoHeight);
      setSprite({ left: center.x, top: center.y, size: GLASSES_W * video.videoWidth * scale });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [alive, maskRef, videoRef]);

  return (
    <div ref={layerRef} className="sunglasses-layer">
      {alive && sprite && (
        <span className="sunglasses" style={{ left: sprite.left, top: sprite.top, fontSize: sprite.size }}>
          🕶️
        </span>
      )}
    </div>
  );
}

