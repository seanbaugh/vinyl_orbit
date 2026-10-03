/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const rule = css.match(/\n\.cover-disc\.spinning \.cover-disc-spin\s*\{[^}]*\}/)?.[0] ?? '';

// Safari redraws a rotating element's gradients (grooves, sheen, CD mask) on the main thread every frame unless the
// element has its own compositing layer; Chrome and Firefox promote it automatically.
test('the spinning disc gets its own compositing layer so Safari rotates it on the GPU', () => {
  expect(rule).toMatch(/animation:\s*vo-spin/);
  expect(rule).toMatch(/will-change:\s*transform/);
  expect(rule).toMatch(/backface-visibility:\s*hidden/);
});
