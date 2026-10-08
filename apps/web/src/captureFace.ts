const WIDTH = 320;
const HEIGHT = 240;
/** Spot the Real Stream's still sits at full decoy-box size right next to
 * the model's actual live video, not as a small thumbnail — a soft,
 * low-res still next to a crisp live feed was itself an instant tell for
 * which box was real, regardless of lighting/mirroring. */
const HIGH_RES_WIDTH = 960;
const HIGH_RES_HEIGHT = 720;

/**
 * A 4:3 centre crop of the current frame as a JPEG data URL.
 *
 * Mirrored by default, to match the selfie-style preview a player sees of
 * their own camera (used for the fun mouth-moment snapshots everyone sees of
 * themselves). Pass `mirror: false` when the image needs to match how OTHER
 * players see this feed instead — e.g. Spot the Real Stream's captured still
 * sits next to the model's real, unmirrored remote video tile, and a
 * mirrored still next to it would give away which box is live.
 *
 * Small (320x240, quality 0.7) by default — plenty for a thumbnail-sized
 * mouth-moment snapshot. Pass `highRes: true` when the image will be shown
 * at full size next to a live feed instead, e.g. Spot the Real Stream.
 */
export function captureFace(
  video: HTMLVideoElement,
  { mirror = true, highRes = false }: { mirror?: boolean; highRes?: boolean } = {},
): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const width = highRes ? HIGH_RES_WIDTH : WIDTH;
  const height = highRes ? HIGH_RES_HEIGHT : HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const sw = Math.min(video.videoWidth, (video.videoHeight * 4) / 3);
  const sh = sw * 0.75;
  const sx = (video.videoWidth - sw) / 2;
  const sy = (video.videoHeight - sh) / 2;
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", highRes ? 1 : 0.7);
}
