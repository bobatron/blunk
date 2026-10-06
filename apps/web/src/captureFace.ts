const WIDTH = 320;
const HEIGHT = 240;

/** A small mirrored, 4:3 centre crop of the current frame as a JPEG data URL. */
export function captureFace(video: HTMLVideoElement): string | null {
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
  ctx.translate(WIDTH, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);
  return canvas.toDataURL("image/jpeg", 0.7);
}
