// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { CoverDisc } from './CoverDisc';

test('CDs get a silver disc without a cover-art label; vinyl keeps the black record with label', () => {
  const cd = render(<CoverDisc coverUrl="/c.jpg" alt="x" spinning={false} kind="cd" />).container;
  expect(cd.querySelector('.cover-disc.cd')).toBeTruthy();
  expect(cd.querySelector('img.cover-disc-label')).toBeNull();

  const lp = render(<CoverDisc coverUrl="/c.jpg" alt="x" spinning={false} kind="vinyl" />).container;
  expect(lp.querySelector('.cover-disc.cd')).toBeNull();
  expect(lp.querySelector('img.cover-disc-label')).toBeTruthy();
});
