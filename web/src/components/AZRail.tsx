const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** Vertical A–Z jump rail. `firstIds` maps a letter to the id of the first release with that key. */
export function AZRail({ firstIds }: { firstIds: Map<string, number> }) {
  const jump = (letter: string) => {
    const id = firstIds.get(letter);
    document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className="az-rail" aria-label="Jump to letter">
      {LETTERS.map((l) => (
        <button key={l} disabled={!firstIds.has(l)} onClick={() => jump(l)}>{l}</button>
      ))}
    </nav>
  );
}
