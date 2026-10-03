import { CoverImage } from './CoverImage';

interface Props {
  coverUrl: string | null;
  alt: string;
  spinning: boolean;
  onClick?: () => void;
}

/** The cover as a sleeve with the record peeking out to the right; the record spins while its preview plays. */
export function CoverDisc({ coverUrl, alt, spinning, onClick }: Props) {
  return (
    <div className={`cover-disc${spinning ? ' spinning' : ''}`}>
      <div className="cover-disc-record" aria-hidden="true">
        <div className="cover-disc-spin">
          {coverUrl ? <img src={coverUrl} alt="" className="cover-disc-label" /> : <span className="cover-disc-label" />}
          <span className="cover-disc-hole" />
        </div>
      </div>
      <CoverImage src={coverUrl} alt={alt} onClick={onClick} className="cover-disc-sleeve" />
    </div>
  );
}
