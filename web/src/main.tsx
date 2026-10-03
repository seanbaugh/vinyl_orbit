import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { NowSpinningProvider } from './lib/nowSpinning';
import { PlayerProvider } from './player/PlayerProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import './theme/theme.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PlayerProvider onClipError={(item) => {
          // Expired preview URL: tell the server so it re-maps, and refetch this record's previews.
          fetch(`/api/releases/${item.releaseId}/previews/${item.trackIdx}/failed`, { method: 'POST' })
            .then(() => queryClient.invalidateQueries({ queryKey: ['previews', item.releaseId] }))
            .catch(() => {});
        }}>
          <NowSpinningProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </NowSpinningProvider>
        </PlayerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
