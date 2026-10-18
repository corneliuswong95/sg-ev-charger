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

const title = 'SG EV Chargers';
const description = 'Live EV charger availability, prices and parking across Singapore.';

// Icons and the link-preview card are file-based: app/icon.svg,
// app/apple-icon.png and app/opengraph-image.png.
export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, siteName: title, type: 'website', locale: 'en_SG' },
  twitter: { card: 'summary_large_image', title, description },
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
