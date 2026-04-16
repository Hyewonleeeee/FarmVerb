import type { Metadata } from 'next';
import { Cormorant_Garamond, Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sora'
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant'
});

export const metadata: Metadata = {
  title: 'FarmVerb | Premium Organic Audio Tools',
  description:
    'FarmVerb crafts premium audio tools with organic motion, futuristic warmth, and artistic sound design workflows.',
  openGraph: {
    title: 'FarmVerb | Grow Your Sound',
    description: 'Organic tools for producers and sound designers.',
    images: ['/Germinate.png']
  },
  themeColor: '#edf7d4'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${cormorant.variable}`}>{children}</body>
    </html>
  );
}
