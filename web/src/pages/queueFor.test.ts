// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { PreviewInfo, ReleaseDetail } from '@api/api-types';
import { queueFor } from './Release';

const track = (idx: number) => ({ idx, position: String(idx), type: 'track', title: `T${idx}`, duration: '', artists: '', credits: '' });
const release = (formatSummary: string) => ({
  id: 1, title: 'R', artists: 'A', coverUrl: null, formatSummary,
  sides: [{ side: 'A', tracks: [track(1), track(2)], totalSeconds: null }],
}) as unknown as ReleaseDetail;
const info = { status: 'ok', tracks: { 1: { previewUrl: 'u1' }, 2: { previewUrl: 'u2' } } } as unknown as PreviewInfo;

test('CD formatSummary gives every queue item kind cd', () => {
  const items = queueFor(release('2×CD'), info);
  expect(items).toHaveLength(2);
  expect(items.every((i) => i.kind === 'cd')).toBe(true);
});

test('LP and unknown formats give kind vinyl', () => {
  expect(queueFor(release('LP'), info).every((i) => i.kind === 'vinyl')).toBe(true);
  expect(queueFor(release(''), info).every((i) => i.kind === 'vinyl')).toBe(true);
});
