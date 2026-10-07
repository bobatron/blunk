const WIDTH = 320;
const HEIGHT = 240;

/**
 * A small 4:3 centre crop of the current frame as a JPEG data URL.
 *
 * Mirrored by default, to match the selfie-style preview a player sees of
 * their own camera (used for the fun mouth-moment snapshots everyone sees of
 * themselves). Pass `mirror: false` when the image needs to match how OTHER
 * players see this feed instead — e.g. Spot the Real Stream's captured still
 * sits next to the model's real, unmirrored remote video tile, and a
 * mirrored still next to it would give away which box is live.
 */
export function captureFace(video: HTMLVideoElement, { mirror = true }: { mirror?: boolean } = {}): string | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const sw = Math.min(video.videoWidth, (video.videoHeight * 4) / 3);
  const sh = sw * 0.75;
  const sx = (video.videoWidth - sw) / 2;
  const sy = (video.videoHeight - sh) / 2;
  if (mirror) {
    ctx.translate(WIDTH, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);
  return canvas.toDataURL("image/jpeg", 0.7);
}
