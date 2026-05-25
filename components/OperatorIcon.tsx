'use client';

import { useState } from 'react';
import { resolveOperator, operatorLogoUrl, operatorInitials } from '@/lib/operators';

interface Props {
  operator: string;
  size?: number;
  className?: string;
}

export default function OperatorIcon({ operator, size = 28, className }: Props) {
  const meta = resolveOperator(operator);
  const url = operatorLogoUrl(meta, Math.max(32, size * 2));
  const [errored, setErrored] = useState(false);
  const showLogo = url && !errored;

  return (
    <span
      className={`op-icon${className ? ' ' + className : ''}`}
      style={{
        width: size,
        height: size,
        background: showLogo ? '#fff' : meta.color,
        color: '#fff',
        fontSize: Math.round(size * 0.42),
      }}
      aria-label={meta.label}
      title={meta.label}
    >
      {showLogo ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : (
        operatorInitials(meta)
      )}
    </span>
  );
}
