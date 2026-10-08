import { useEffect, useRef, useState } from "react";
import { useLocalFace } from "./localFace";
import { toLayerPx } from "./layerMath";
import { bothEyesCovered, eyeGap, type GlassesPos } from "./glassesMath";
import { getTuning } from "./tuning";
import { useGameServer } from "./game-server/useGameServer";
import "./Sunglasses.css";

const TICK_MS = 40;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Glasses extends GlassesPos {
  angle: number;
  turnAt: number;
  expiresAt: number;
}

/**
 * A pair of sunglasses drifts over your face. Holding both eyes behind them
 * and blinking takes a photo: everyone else still in the round loses a life.
 * The masked state is written to maskRef so the blink handler can tell a
 * photo from a normal blink. Size, speed, and timing come from the tuning
 * store, separately from the bugs.
 */
export function Sunglasses() {
  const { detector, videoRef, maskRef, photoRef } = useLocalFace();
  const { roundActive, playerId, players } = useGameServer();
  const me = players.find((p) => p.id === playerId);
  const alive = roundActive && (me?.lives ?? 0) > 0;

  const layerRef = useRef<HTMLDivElement>(null);
  const [sprite, setSprite] = useState<{ left: number; top: number; size: number } | null>(null);
  const glassesRef = useRef<Glasses | null>(null);
  const photosSeen = useRef(0);
  // This player's own live eye-gap (normalized video coords), so the
  // glasses are sized relative to their actual face, not a fixed fraction
  // of the frame — kept fresh here, read from the sizing tick below too.
  // Starts at a plausible default rather than 0, so the very first sprite
  // (before any eyePositions event has arrived) isn't sized to nothing.
  const eyeGapRef = useRef(0.1);

  // Keep the mask flag and the live eye-gap in step with the eyes and the current glasses.
  useEffect(() => {
    if (!detector) return;
    const off = detector.on("eyePositions", (eyes) => {
      eyeGapRef.current = eyeGap(eyes.left, eyes.right);
      const g = glassesRef.current;
      maskRef.current = Boolean(g && bothEyesCovered(eyes.left, eyes.right, g, getTuning()));
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
      const t = getTuning();
      const now = Date.now();
      glassesRef.current = {
        x: rand(0.25, 0.75),
        y: rand(0.25, 0.75),
        angle: rand(0, Math.PI * 2),
        turnAt: now + rand(t.glassesTurnMinMs, Math.max(t.glassesTurnMinMs, t.glassesTurnMaxMs)),
        expiresAt: now + t.glassesLifetimeMs,
      };
      timer = setTimeout(spawn, rand(t.glassesGapMinMs, Math.max(t.glassesGapMinMs, t.glassesGapMaxMs)));
    };
    const t0 = getTuning();
    timer = setTimeout(spawn, rand(t0.glassesFirstMinMs, Math.max(t0.glassesFirstMinMs, t0.glassesFirstMaxMs)));
    return () => clearTimeout(timer);
  }, [alive]);

  // Drift the glasses around the face and place the sprite.
  useEffect(() => {
    if (!alive) return;
    const id = setInterval(() => {
      const now = Date.now();
      const t = getTuning();
      if (photoRef.current !== photosSeen.current) {
        // A photo was taken with these glasses: take them off until the next appearance.
        photosSeen.current = photoRef.current;
        glassesRef.current = null;
        maskRef.current = false;
      }
      let g = glassesRef.current;
      if (g && g.expiresAt <= now) {
        glassesRef.current = null;
        maskRef.current = false;
        g = null;
      }
      if (g) {
        const dt = TICK_MS / 1000;
        let angle = g.angle;
        let turnAt = g.turnAt;
        if (now >= turnAt) {
          angle = rand(0, Math.PI * 2);
          turnAt = now + rand(t.glassesTurnMinMs, Math.max(t.glassesTurnMinMs, t.glassesTurnMaxMs));
        }
        let x = g.x + Math.cos(angle) * t.glassesSpeed * dt;
        let y = g.y + Math.sin(angle) * t.glassesSpeed * dt;
        if (x < 0.15 || x > 0.85) {
          angle = Math.PI - angle;
          x = Math.min(Math.max(x, 0.15), 0.85);
        }
        if (y < 0.2 || y > 0.8) {
          angle = -angle;
          y = Math.min(Math.max(y, 0.2), 0.8);
        }
        g = { ...g, x, y, angle, turnAt };
        glassesRef.current = g;
      }
      const layer = layerRef.current;
      const video = videoRef.current;
      if (!g || !layer || !video || !video.videoWidth) {
        setSprite(null);
        return;
      }
      const center = toLayerPx(layer, video, g.x, g.y);
      if (!center) return;
      const scale = Math.max(layer.clientWidth / video.videoWidth, layer.clientHeight / video.videoHeight);
      const width = eyeGapRef.current * t.glassesEyeGapMultiplier;
      setSprite({ left: center.x, top: center.y, size: width * video.videoWidth * scale });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [alive, maskRef, videoRef, photoRef]);

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
