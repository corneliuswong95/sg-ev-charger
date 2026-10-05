import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

// Barlow takes after highway and car park signage; the condensed cut is used
// for numerals (availability, prices, kW).
const sans = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const num = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-num',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SG EV Chargers',
  description: 'Live EV charger availability, prices and parking across Singapore.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#edf0ef',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${num.variable}`}>
      <body>{children}</body>
    </html>
  );
}
