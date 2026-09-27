import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import GoogleAnalyticsPageViews from '@/components/analytics/GoogleAnalyticsPageViews';
import LemonCheckoutProvider from '@/components/checkout/LemonCheckoutProvider';
import { GA4_MEASUREMENT_ID, GOOGLE_ADS_ID } from '@/lib/analytics/config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://farmverb.com'),
  title: 'FarmVerb | Premium Organic Audio Tools',
  description:
    'FarmVerb crafts premium audio tools with organic motion, futuristic warmth, and artistic sound design workflows.',
  openGraph: {
    title: 'FarmVerb | Grow Your Sound',
    description: 'Organic tools for producers and sound designers.',
    images: ['/Main/Main.jpg']
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
      <body className="font-vars">
        <LemonCheckoutProvider>{children}</LemonCheckoutProvider>
        <GoogleAnalyticsPageViews measurementId={GA4_MEASUREMENT_ID} />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="farmverb-ga4" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA4_MEASUREMENT_ID}', { send_page_view: false });
            gtag('config', '${GOOGLE_ADS_ID}');
            window.dispatchEvent(new Event('farmverb-ga-ready'));
          `}
        </Script>
      </body>
    </html>
  );
}
