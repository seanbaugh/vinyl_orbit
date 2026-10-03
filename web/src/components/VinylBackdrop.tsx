const RINGS = Array.from({ length: 40 }, (_, i) => 200 + i * 8.8);

/** A giant, faint record turning slowly in the bottom-right corner behind every page. */
export function VinylBackdrop() {
  return (
    <div className="vinyl-backdrop" aria-hidden="true">
      <div className="vinyl-backdrop-disc">
        <svg viewBox="0 0 1100 1100" width="1100" height="1100">
          {RINGS.map((r) => <circle key={r} cx="550" cy="550" r={r} fill="none" stroke="var(--groove-line)" strokeWidth="1" />)}
          <circle cx="550" cy="550" r="180" className="vinyl-backdrop-label" />
          <circle cx="550" cy="550" r="10" fill="var(--bg)" />
        </svg>
        <div className="vinyl-backdrop-sheen" />
      </div>
    </div>
  );
}
