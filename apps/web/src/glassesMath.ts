import type { Tuning } from "./tuning";

/** Glasses height as a fraction of their width, matching the original tuned shape. */
export const GLASSES_ASPECT = 0.36;

/** A pair of sunglasses, centred at (x, y) in normalized video coordinates. */
export interface GlassesPos {
  x: number;
  y: number;
}

type EyePoint = { x: number; y: number };

/** Interocular distance in normalized video coordinates — scales naturally
 * with how close the face is to the camera, unlike a fixed fraction of the
 * frame (which made the glasses look a different size on a phone held close
 * to the face versus a laptop further away). */
export function eyeGap(left: EyePoint, right: EyePoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

/** True if this eye sits inside glasses of the given width (normalized
 * video coordinates), centred at g. */
export function eyeCovered(eye: EyePoint, g: GlassesPos, width: number, t: Tuning): boolean {
  return (
    Math.abs(eye.x - g.x) < (width / 2) * t.glassesCoverSlack &&
    Math.abs(eye.y - g.y) < ((width * GLASSES_ASPECT) / 2) * t.glassesCoverSlack
  );
}

/** True if both eyes sit behind the glasses, sized from this player's own
 * live eye gap rather than a fixed fraction of the frame. */
export function bothEyesCovered(left: EyePoint, right: EyePoint, g: GlassesPos, t: Tuning): boolean {
  const width = eyeGap(left, right) * t.glassesEyeGapMultiplier;
  return eyeCovered(left, g, width, t) && eyeCovered(right, g, width, t);
}
