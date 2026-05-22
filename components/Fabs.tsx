'use client';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
}

export default function Fabs({ onZoomIn, onZoomOut, onLocate }: Props) {
  return (
    <div className="fab-cluster">
      <button className="fab" onClick={onZoomIn} aria-label="Zoom in">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" />
        </svg>
      </button>
      <button className="fab" onClick={onZoomOut} aria-label="Zoom out">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 13H5V11H19V13Z" />
        </svg>
      </button>
      <button className="fab locate" onClick={onLocate} aria-label="My location">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </button>
    </div>
  );
}
