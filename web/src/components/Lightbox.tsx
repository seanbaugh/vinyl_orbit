import { ChevronLeft, ChevronRight, Disc3, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  images: { idx: number; url: string }[];
  startIdx: number;
  alt: string;
  onClose: () => void;
  /** When given, shows a Spin now button in the bar. */
  onSpin?: () => void;
}

export function Lightbox({ images, startIdx, alt, onClose, onSpin }: Props) {
  const [i, setI] = useState(Math.max(0, images.findIndex((img) => img.idx === startIdx)));
  const n = images.length;
  const go = (d: number) => setI((cur) => (cur + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }); // re-bind each render so `go` sees current n

  if (!n) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Images">
      <div className="lightbox-bar">
        <span className="grow">{i + 1} / {n}</span>
        {onSpin && <button className="btn btn-primary" onClick={onSpin}><Disc3 /> Spin now</button>}
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
      </div>
      <div className="lightbox-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {n > 1 && <button className="icon-btn lightbox-nav" style={{ left: 16 }} onClick={() => go(-1)} aria-label="Previous"><ChevronLeft /></button>}
        <img src={images[i].url} alt={`${alt} — image ${i + 1}`} />
        {n > 1 && <button className="icon-btn lightbox-nav" style={{ right: 16 }} onClick={() => go(1)} aria-label="Next"><ChevronRight /></button>}
      </div>
      {n > 1 && (
        <div className="lightbox-thumbs">
          {images.map((img, j) => (
            <button key={img.idx} className={j === i ? 'active' : ''} onClick={() => setI(j)} aria-label={`Image ${j + 1}`}>
              <img src={img.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
