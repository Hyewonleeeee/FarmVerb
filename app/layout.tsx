import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import GoogleAnalyticsPageViews from '@/components/analytics/GoogleAnalyticsPageViews';
import SignupConversionRecovery from '@/components/analytics/SignupConversionRecovery';
import BlackFridayPreviewProvider from '@/components/campaigns/BlackFridayPreviewProvider';
import LemonCheckoutProvider from '@/components/checkout/LemonCheckoutProvider';
import { GA4_MEASUREMENT_ID, GOOGLE_ADS_ID } from '@/lib/analytics/config';
import { isBlackFriday2026PreviewEnvironment } from '@/lib/campaigns/blackFriday2026';
import './globals.css';

const BLACK_FRIDAY_PREVIEW = isBlackFriday2026PreviewEnvironment();

export const metadata: Metadata = {
  metadataBase: new URL('https://farmverb.com'),
  title: 'FarmVerb | Premium Organic Audio Tools',
  description:
    'FarmVerb crafts premium audio tools with organic motion, futuristic warmth, and artistic sound design workflows.',
  openGraph: {
    title: 'FarmVerb | Grow Your Sound',
    description: 'Organic tools for producers and sound designers.',
    images: ['/Main/Main.jpg']
  },
  robots: BLACK_FRIDAY_PREVIEW
    ? {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true
        }
      }
    : undefined
};

export const viewport: Viewport = {
  themeColor: BLACK_FRIDAY_PREVIEW ? '#111210' : '#edf7d4'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-vars">
        <BlackFridayPreviewProvider enabled={BLACK_FRIDAY_PREVIEW}>
          <LemonCheckoutProvider enabled={!BLACK_FRIDAY_PREVIEW}>{children}</LemonCheckoutProvider>
          {!BLACK_FRIDAY_PREVIEW ? (
            <>
              <GoogleAnalyticsPageViews measurementId={GA4_MEASUREMENT_ID} />
              <SignupConversionRecovery />
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
            </>
          ) : null}
        </BlackFridayPreviewProvider>
      </body>
    </html>
  );
}
