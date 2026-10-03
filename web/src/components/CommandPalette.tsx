export function CommandPalette({ onClose }: { onClose: () => void }) {
  return <div className="palette-wrap" onClick={onClose} />;
}
