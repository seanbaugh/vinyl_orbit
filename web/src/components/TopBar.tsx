import { BarChart3, Menu, Moon, Palette, Search, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SpinningNowButton } from './SpinningNowButton';
import { SpinPicker } from './SpinPicker';
import { ACCENTS, useTheme } from '../theme/ThemeProvider';

export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pickerOpen]);

  return (
    <header className="topbar">
      <button className="icon-btn only-mobile" onClick={onMenu} aria-label="Open menu"><Menu /></button>
      <button className="search-pill" onClick={onSearch}>
        <Search />
        <span className="ellipsis">Search records, artists, tracks, notes…</span>
        <span className="kbd">{isMac ? '⌘' : 'Ctrl'} K</span>
      </button>
      <div className="spacer" />
      <SpinPicker />
      <SpinningNowButton />
      <Link className="icon-btn" to="/stats" title="Stats" aria-label="Stats"><BarChart3 /></Link>
      <div ref={pickerRef} style={{ position: 'relative' }}>
        <button className="icon-btn" onClick={() => setPickerOpen(!pickerOpen)} title="Accent colour" aria-label="Accent colour">
          <Palette />
        </button>
        {pickerOpen && (
          <div className="popover" style={{ right: 0, top: 42 }}>
            <div className="section-title">Accent</div>
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button key={a.value} className={`swatch${a.value === accent ? ' active' : ''}`} style={{ background: a.value }}
                  title={a.name} aria-label={a.name} onClick={() => setAccent(a.value)} />
              ))}
            </div>
          </div>
        )}
      </div>
      <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun /> : <Moon />}
      </button>
    </header>
  );
}
