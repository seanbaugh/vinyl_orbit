/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const rule = css.match(/\n\.spinning-now-bg\s*\{[^}]*\}/)?.[0] ?? '';

// A huge blurred layer is rasterised in tiles by WebKit and shows hard-edged bands that shift on repaint.
// The backdrop must be a small element, lightly blurred, scaled up by the compositor.
test('the spinning-now backdrop blurs a small element and scales it up, instead of one huge blur', () => {
  const blur = Number(rule.match(/blur\((\d+)px\)/)?.[1]);
  const scale = Number(rule.match(/scale\(([\d.]+)\)/)?.[1]);
  expect(blur).toBeLessThanOrEqual(24);
  expect(scale).toBeGreaterThanOrEqual(3);
});
