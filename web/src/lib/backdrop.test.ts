import { expect, test } from 'vitest';
import { blurRgba, tintRgba } from './backdrop';

const image = (w: number, h: number, fill: (x: number, y: number) => [number, number, number]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y);
    d.set([r, g, b, 255], (y * w + x) * 4);
  }
  return d;
};
const red = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4];

test('blur spreads a bright pixel into its neighbours and keeps the total light roughly the same', () => {
  const d = image(15, 15, (x, y) => (x === 7 && y === 7 ? [255, 255, 255] : [0, 0, 0]));
  const before = d.reduce((s, v, i) => s + (i % 4 === 0 ? v : 0), 0);
  blurRgba(d, 15, 15, 2, 3);
  expect(red(d, 15, 7, 7)).toBeLessThan(255);
  expect(red(d, 15, 9, 7)).toBeGreaterThan(0);
  const after = d.reduce((s, v, i) => s + (i % 4 === 0 ? v : 0), 0);
  expect(Math.abs(after - before) / before).toBeLessThan(0.1);
});

test('blur keeps a flat colour flat all the way to the edges', () => {
  const d = image(12, 8, () => [100, 150, 200]);
  blurRgba(d, 12, 8, 2, 3);
  for (const [x, y] of [[0, 0], [11, 7], [5, 3]]) {
    expect(Math.abs(red(d, 12, x, y) - 100)).toBeLessThanOrEqual(1);
  }
});

test('tint darkens by the brightness factor and leaves grey grey', () => {
  const d = image(1, 1, () => [100, 100, 100]);
  tintRgba(d, 1.3, 0.65);
  expect([d[0], d[1], d[2]].every((v) => Math.abs(v - 65) <= 1)).toBe(true);
  expect(d[3]).toBe(255);
});

test('tint makes colours richer when saturating', () => {
  const d = image(1, 1, () => [200, 80, 80]);
  tintRgba(d, 1.3, 1);
  expect(d[0] - d[1]).toBeGreaterThan(200 - 80);
});
