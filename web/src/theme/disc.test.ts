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

// The grooves and the CD surface are circularly symmetric, so rotating them is invisible but costs the most to rotate.
// They live on the static record; only the label and the sheen (which are not symmetric) sit on the rotating layer.
const ruleFor = (selector: string) =>
  css.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')}\\s*\\{[^}]*\\}`))?.[0] ?? '';

test('vinyl grooves are drawn on the static record, not on the rotating layer', () => {
  expect(ruleFor('.cover-disc-record')).toMatch(/repeating-radial-gradient/);
  expect(ruleFor('.cover-disc-spin')).not.toMatch(/repeating-radial-gradient/);
});

test('the CD surface is drawn on the static record, not on the rotating layer', () => {
  expect(ruleFor('.cover-disc.cd .cover-disc-record')).toMatch(/radial-gradient\(circle, #e9ecef/);
  expect(ruleFor('.cover-disc.cd .cover-disc-spin')).not.toMatch(/radial-gradient/);
});
