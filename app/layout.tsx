import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://farmverb.com'),
  title: 'FarmVerb | Premium Organic Audio Tools',
  description:
    'FarmVerb crafts premium audio tools with organic motion, futuristic warmth, and artistic sound design workflows.',
  openGraph: {
    title: 'FarmVerb | Grow Your Sound',
    description: 'Organic tools for producers and sound designers.',
    images: ['/Germinate/Germinate.png']
  }
};

export const viewport: Viewport = {
  themeColor: '#edf7d4'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-vars">{children}</body>
    </html>
  );
}
