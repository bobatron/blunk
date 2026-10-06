/** Layer px for a mouth position in the (mirrored, object-fit: cover) video. */
export function toLayerPx(
  layer: HTMLElement,
  video: HTMLVideoElement,
  nx: number,
  ny: number,
): { x: number; y: number } | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const w = layer.clientWidth;
  const h = layer.clientHeight;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(w / vw, h / vh);
  const ox = (w - vw * scale) / 2;
  const oy = (h - vh * scale) / 2;
  return { x: ox + (1 - nx) * vw * scale, y: oy + ny * vh * scale };
}


