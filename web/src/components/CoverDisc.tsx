import { CoverImage } from './CoverImage';

interface Props {
  coverUrl: string | null;
  alt: string;
  spinning: boolean;
  /** 'cd' shows a silver compact disc; 'vinyl' a black record with the cover as its label. */
  kind?: 'vinyl' | 'cd';
  onClick?: () => void;
}

/** The cover as a sleeve with the record peeking out to the right; the record spins while its preview plays. */
export function CoverDisc({ coverUrl, alt, spinning, kind = 'vinyl', onClick }: Props) {
  return (
    <div className={`cover-disc${kind === 'cd' ? ' cd' : ''}${spinning ? ' spinning' : ''}`}>
      <div className="cover-disc-record" aria-hidden="true">
        <div className="cover-disc-spin">
          {kind === 'cd' ? <span className="cd-hub" />
            : coverUrl ? <img src={coverUrl} alt="" className="cover-disc-label" /> : <span className="cover-disc-label" />}
          <span className="cover-disc-hole" />
        </div>
      </div>
      <CoverImage src={coverUrl} alt={alt} onClick={onClick} className="cover-disc-sleeve" />
    </div>
  );
}
