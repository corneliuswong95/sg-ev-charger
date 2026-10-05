'use client';

import { useState } from 'react';
import { resolveOperator, operatorLogoUrl, operatorInitials } from '@/lib/operators';

interface Props {
  operator: string;
  size?: number;
}

export default function OperatorIcon({ operator, size = 28 }: Props) {
  const meta = resolveOperator(operator);
  const url = operatorLogoUrl(meta, Math.max(32, size * 2));
  const [errored, setErrored] = useState(false);
  const showLogo = url && !errored;

  return (
    <span
      className="op-icon"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: showLogo ? '#fff' : meta.color,
        color: '#fff',
        fontSize: Math.round(size * 0.4),
      }}
      title={meta.label}
      aria-hidden
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setErrored(true)} />
      ) : (
        operatorInitials(meta)
      )}
    </span>
  );
}
