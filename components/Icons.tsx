import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const BoltIcon = (p: P) => (
  <Svg {...p}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" fill="currentColor" stroke="none" /></Svg>
);
export const SearchIcon = (p: P) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);
export const RefreshIcon = (p: P) => (
  <Svg {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Svg>
);
export const CloseIcon = (p: P) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const ChevronIcon = (p: P) => (
  <Svg {...p}><path d="m6 15 6-6 6 6" /></Svg>
);
export const CaretIcon = (p: P) => (
  <Svg {...p}><path d="m7 10 5 5 5-5" /></Svg>
);
export const MapIcon = (p: P) => (
  <Svg {...p}><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z" /><path d="M9 4v13.5M15 6.5V20" /></Svg>
);
export const TagIcon = (p: P) => (
  <Svg {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.5" fill="currentColor" /></Svg>
);
export const LocateIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>
);
export const PlusIcon = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const MinusIcon = (p: P) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);
export const NavigateIcon = (p: P) => (
  <Svg {...p}><path d="M3 11 21 3l-8 18-2-8-8-2Z" fill="currentColor" /></Svg>
);
export const CopyIcon = (p: P) => (
  <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Svg>
);
export const CheckIcon = (p: P) => (
  <Svg {...p}><path d="m5 12 5 5 9-10" /></Svg>
);
