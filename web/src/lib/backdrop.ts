/** Edge size of the pre-blurred backdrop canvas; the browser stretches it to fill the screen. */
export const BACKDROP_SIZE = 64;

/** In-place separable box blur (edges clamped); `passes` box passes approximate a Gaussian. Alpha is left alone. */
export function blurRgba(data: Uint8ClampedArray, w: number, h: number, radius: number, passes: number): void {
  const tmp = new Float32Array(Math.max(w, h) * 3);
  const line = (start: number, step: number, n: number) => {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += data[start + Math.min(n - 1, Math.max(0, i)) * step + c];
      for (let i = 0; i < n; i++) {
        tmp[i * 3 + c] = sum / (2 * radius + 1);
        sum += data[start + Math.min(n - 1, i + radius + 1) * step + c] - data[start + Math.max(0, i - radius) * step + c];
      }
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[start + i * step + c] = tmp[i * 3 + c];
  };
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) line(y * w * 4, 4, w);
    for (let x = 0; x < w; x++) line(x * 4, w * 4, h);
  }
}

/** In-place saturation then brightness (same maths as CSS `saturate()` / `brightness()` closely enough for a backdrop). */
export function tintRgba(data: Uint8ClampedArray, saturate: number, brightness: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    for (let c = 0; c < 3; c++) data[i + c] = (lum + (data[i + c] - lum) * saturate) * brightness;
  }
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('cover failed to load'));
  img.src = src;
});

/**
 * Paints a soft, darkened version of the cover into `canvas` once. A live CSS blur on a full-screen element made WebKit
 * band and made the spinning disc jerk; a tiny static canvas that the browser merely stretches costs nothing per frame.
 * `abstract` blurs far harder so only drifting colour is left, not the shapes of the cover (projector mode).
 * If the pixels can't be read (cross-origin cover) the canvas is left blank rather than showing a blocky picture.
 */
export async function paintBackdrop(canvas: HTMLCanvasElement, src: string, abstract = false): Promise<void> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const img = await loadImage(src);
  canvas.width = canvas.height = BACKDROP_SIZE;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, BACKDROP_SIZE, BACKDROP_SIZE);
  try {
    const px = ctx.getImageData(0, 0, BACKDROP_SIZE, BACKDROP_SIZE);
    blurRgba(px.data, BACKDROP_SIZE, BACKDROP_SIZE, abstract ? 6 : 2, 3);
    tintRgba(px.data, 1.3, 0.65);
    ctx.putImageData(px, 0, 0);
  } catch {
    ctx.clearRect(0, 0, BACKDROP_SIZE, BACKDROP_SIZE);
  }
}
