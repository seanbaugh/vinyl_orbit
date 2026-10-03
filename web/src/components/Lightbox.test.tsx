// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Lightbox } from './Lightbox';

const images = [{ idx: 0, url: '/a.jpg' }];
afterEach(cleanup);

test('shows a Spin now button only when onSpin is given, and calls it', () => {
  const without = render(<Lightbox images={images} startIdx={0} alt="x" onClose={() => {}} />);
  expect(without.queryByRole('button', { name: /Spin now/ })).toBeNull();
  without.unmount();

  const onSpin = vi.fn();
  const view = render(<Lightbox images={images} startIdx={0} alt="x" onClose={() => {}} onSpin={onSpin} />);
  act(() => { view.getByRole('button', { name: /Spin now/ }).click(); });
  expect(onSpin).toHaveBeenCalledTimes(1);
});
