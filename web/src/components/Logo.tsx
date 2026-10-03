/** "Groove arc" mark + lowercase wordmark. Colours come from theme tokens, so the accent picker recolours it. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" className="logo-mark">
        <circle cx="22" cy="22" r="20" fill="var(--surface-2)" />
        <circle cx="22" cy="22" r="16.5" fill="none" stroke="var(--border-strong)" strokeWidth="1" />
        <circle cx="22" cy="22" r="13" fill="none" stroke="var(--border-strong)" strokeWidth="1" />
        <path d="M22 2.5 A19.5 19.5 0 0 1 41.5 22" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="22" cy="22" r="7" fill="var(--accent)" />
        <circle cx="22" cy="22" r="1.6" fill="var(--bg)" />
      </svg>
      <span className="wordmark" aria-label="Vinyl Orbit">vinyl<span>orbit</span></span>
    </span>
  );
}
