// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, test } from 'vitest';
import { KeyedByParam } from './routing';

function Probe({ id }: { id: string }) {
  const [initial] = useState(id); // stale if the component is reused across ids
  return <div>initial:{initial}</div>;
}

test('final: changing the :id param remounts the page so per-record state cannot leak', async () => {
  const router = createMemoryRouter(
    [{ path: '/release/:id', element: <KeyedByParam param="id" render={(id) => <Probe id={id} />} /> }],
    { initialEntries: ['/release/1'] },
  );
  render(<RouterProvider router={router} />);
  expect(screen.getByText('initial:1')).toBeTruthy();
  await act(() => router.navigate('/release/2?tab=notes'));
  expect(screen.getByText('initial:2')).toBeTruthy();
});
