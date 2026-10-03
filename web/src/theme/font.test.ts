/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

test('the spinning-now display font is the self-hosted Clarity City, not a system serif', () => {
  expect(css).toMatch(/--display:\s*"Clarity City"/);
});

test('every Clarity City @font-face points at a font file shipped in web/public/fonts', () => {
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*Clarity City[^}]*\}/g)].map((m) => m[0]);
  expect(faces.length).toBeGreaterThanOrEqual(2); // latin + latin-ext
  for (const face of faces) {
    const url = face.match(/url\(['"]?\/fonts\/([^'")]+)['"]?\)/)?.[1];
    expect(url, face).toBeTruthy();
    expect(existsSync(new URL(`../../public/fonts/${url}`, import.meta.url)), url).toBe(true);
  }
});
