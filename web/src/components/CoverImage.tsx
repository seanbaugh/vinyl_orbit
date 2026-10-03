import { useState, type ReactNode } from 'react';

interface Props {
  src: string | null;
  alt: string;
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Square cover art with a vinyl placeholder when there is no image or it fails to load. */
export function CoverImage({ src, alt, children, onClick, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <div className={`cover ${className}`} onClick={onClick}>
      {showImage ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="placeholder" role="img" aria-label={`${alt} (no cover)`}>
          <div className="placeholder-disc" />
        </div>
      )}
      {children}
    </div>
  );
}
