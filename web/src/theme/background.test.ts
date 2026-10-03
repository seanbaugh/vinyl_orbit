/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const rule = css.match(/\n\.spinning-now-bg\s*\{[^}]*\}/)?.[0] ?? '';

// A live blur filter on the full-screen backdrop made WebKit draw hard-edged bands (one huge layer) and then made the
// spinning disc jerk (a small layer scaled up, redrawn every frame). The blur is baked into a tiny canvas instead.
test('the spinning-now backdrop has no live filter, so spinning stays on the cheap compositing path', () => {
  expect(rule).not.toBe('');
  expect(rule).not.toMatch(/filter\s*:/);
  expect(rule).not.toMatch(/will-change/);
});
