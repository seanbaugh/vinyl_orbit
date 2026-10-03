/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const zIndex = (selector: string) => {
  const rule = css.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{[^}]*\\}`));
  return Number(rule?.[0].match(/z-index:\s*(\d+)/)?.[1]);
};

test('the toast sits above the full-screen spinning-now overlay so "Logged a play" is visible', () => {
  expect(zIndex('.toast')).toBeGreaterThan(zIndex('.spinning-now'));
});
