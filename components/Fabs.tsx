'use client';

import { LocateIcon, MinusIcon, PlusIcon } from './Icons';

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
  located: boolean;
  hidden: boolean;
}

export default function Fabs({ onZoomIn, onZoomOut, onLocate, located, hidden }: Props) {
  return (
    <div className="fab-cluster" style={hidden ? { opacity: 0, pointerEvents: 'none' } : undefined}>
      <button
        className={`fab fab-locate${located ? ' on' : ''}`}
        onClick={onLocate}
        aria-label="Show my location"
      >
        <LocateIcon size={20} />
      </button>
      <div className="fab-group">
        <button className="fab" onClick={onZoomIn} aria-label="Zoom in">
          <PlusIcon size={20} />
        </button>
        <button className="fab" onClick={onZoomOut} aria-label="Zoom out">
          <MinusIcon size={20} />
        </button>
      </div>
    </div>
  );
}
