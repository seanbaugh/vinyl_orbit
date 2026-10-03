import { expect, test } from 'vitest';
import { formatFamily } from './formats';

test('formatFamily groups format summaries into colour families', () => {
  expect(formatFamily('LP')).toBe('lp');
  expect(formatFamily('2×LP')).toBe('lp');
  expect(formatFamily('3×LP + Box')).toBe('box');
  expect(formatFamily('CD')).toBe('cd');
  expect(formatFamily('2×CD')).toBe('cd');
  expect(formatFamily('EP')).toBe('ep');
  expect(formatFamily('12"')).toBe('ep');
  expect(formatFamily('2×12"')).toBe('ep');
  expect(formatFamily('10"')).toBe('ep');
  expect(formatFamily('7"')).toBe('single');
  expect(formatFamily('Cassette')).toBe('cassette');
  expect(formatFamily('Vinyl')).toBe('other');
  expect(formatFamily('')).toBe('other');
});
