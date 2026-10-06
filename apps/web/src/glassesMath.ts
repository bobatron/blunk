import type { Tuning } from "./tuning";

/** A pair of sunglasses, centred at (x, y) in normalized video coordinates. */
export interface GlassesPos {
  x: number;
  y: number;
}

/** True if this eye sits inside the glasses' lenses. */
export function eyeCovered(eye: { x: number; y: number }, g: GlassesPos, t: Tuning): boolean {
  return (
    Math.abs(eye.x - g.x) < (t.glassesWidth / 2) * t.glassesCoverSlack &&
    Math.abs(eye.y - g.y) < (t.glassesHeight / 2) * t.glassesCoverSlack
  );
}

/** True if both eyes sit behind the glasses. */
export function bothEyesCovered(
  left: { x: number; y: number },
  right: { x: number; y: number },
  g: GlassesPos,
  t: Tuning,
): boolean {
  return eyeCovered(left, g, t) && eyeCovered(right, g, t);
}
