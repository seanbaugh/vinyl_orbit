import { useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { CommandPalette } from './components/CommandPalette';
import { MiniPlayer } from './components/MiniPlayer';
import { usePlayer } from './player/PlayerProvider';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { VinylBackdrop } from './components/VinylBackdrop';
import { KeyedByParam } from './lib/routing';
import { Browse } from './pages/Browse';
import { CratePage } from './pages/Crate';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Release } from './pages/Release';
import { Stats } from './pages/Stats';

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const player = usePlayer();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // New page → scroll to top (query-only changes like filters keep position).
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="app">
      <VinylBackdrop />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="main">
        <TopBar onMenu={() => setMenuOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <div className={`content${player.current ? ' with-player' : ''}`} ref={contentRef} id="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/release/:id" element={<KeyedByParam param="id" render={() => <Release />} />} />
            <Route path="/browse/:facet" element={<Browse />} />
            <Route path="/crate/:id" element={<CratePage />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="*" element={<div className="empty">Page not found.</div>} />
          </Routes>
        </div>
      </div>
      <MiniPlayer />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
