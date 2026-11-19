'use client';

import Link from 'next/link';
import { useBlackFridayPreview } from '@/components/campaigns/BlackFridayPreviewProvider';
import {
  BLACK_FRIDAY_2026,
  getBlackFriday2026FeaturedOffers
} from '@/lib/campaigns/blackFriday2026';
import { formatUsdPrice } from '@/lib/pricing/products';
import { getCampaignPriceBySlug } from '@/lib/campaigns/blackFridayPricing';
import { PRODUCT_PUBLIC_PATHS, type ProductPublicRouteKey } from '@/lib/ui/farmVerbRoutes';

const FEATURED_OFFERS = getBlackFriday2026FeaturedOffers();
const MAX_DISCOUNT = Math.max(...FEATURED_OFFERS.map(({ product }) =>
  getCampaignPriceBySlug(product.slug, 'active')?.discountPercent ?? 0));

const PRODUCT_ROUTE_BY_SLUG: Record<string, string> = PRODUCT_PUBLIC_PATHS;

const HERO_PRODUCTS = [
  {
    name: 'Nebula Series',
    image: '/Nebula%20Series/Main/Nebula%20Series.png',
    tone: 'violet'
  },
  {
    name: 'Organic Series',
    image: '/Organic%20Series/Organic%20Series%20Bundle.png',
    tone: 'sage'
  },
  {
    name: 'Glitch Drum Pack',
    image: '/GlitchDrum/GlitchDrum.png',
    tone: 'sand'
  }
] as const;

export function BlackFridayNoticeBar() {
  const { saleActive } = useBlackFridayPreview();
  if (!saleActive) {
    return null;
  }

  return (
    <aside className="bf-notice-bar" aria-label="Black Friday promotion">
      <span className="bf-notice-mark">FARMVERB</span>
      <span className="bf-notice-event">Black Friday 2026</span>
      <span className="bf-notice-date">{BLACK_FRIDAY_2026.displayDates}</span>
    </aside>
  );
}

export function BlackFridayHero() {
  return (
    <section className="bf-hero" aria-labelledby="black-friday-heading">
      <div className="bf-hero-grid">
        <div className="bf-hero-copy">
          <p className="bf-hero-eyebrow">FarmVerb presents</p>
          <h1 id="black-friday-heading">
            <span>Black</span>
            <span className="bf-hero-friday">Friday</span>
            <span className="bf-hero-year">2026</span>
          </h1>
          <p className="bf-hero-intro">
            Explore Black Friday offers across Nebula, Organic, and Glitch Drum Pack.
          </p>
          <div className="bf-hero-meta">
            <span>{BLACK_FRIDAY_2026.displayDates}</span>
            <span className="bf-hero-discount">Up to {MAX_DISCOUNT}% off</span>
          </div>
          <a href="#black-friday-sale" className="bf-hero-cta">
            Explore the sale
            <span aria-hidden="true">↘</span>
          </a>
        </div>

        <div className="bf-hero-product-stage" aria-label="Featured FarmVerb products">
          {HERO_PRODUCTS.map((product, index) => (
            <figure
              key={product.name}
              className={`bf-hero-product bf-hero-product-${index + 1} bf-tone-${product.tone}`}
            >
              {index === 0 ? <figcaption>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {product.name}
              </figcaption> : null}
              <div className="bf-hero-product-frame">
                <img src={product.image} alt={`${product.name} product artwork`} />
              </div>
              {index > 0 ? <figcaption>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {product.name}
              </figcaption> : null}
            </figure>
          ))}
        </div>
      </div>
      <div className="bf-hero-footnote">
        <span>Instruments · Effects · Samples</span>
        <span>Made for your next idea.</span>
      </div>
    </section>
  );
}

export function BlackFridaySaleSection() {
  return (
    <section className="bf-sale-section" id="black-friday-sale" aria-labelledby="black-friday-sale-heading">
      <header className="bf-sale-heading">
        <div>
          <p className="section-overline">Black Friday selection</p>
          <h2 id="black-friday-sale-heading">Black Friday Picks</h2>
        </div>
        <div className="bf-sale-heading-note">
          <span>{BLACK_FRIDAY_2026.displayDates}</span>
          <p>Creative effects, organic textures, and distinctive percussion. Find your next sound.</p>
        </div>
      </header>

      <div className="bf-sale-grid">
        {FEATURED_OFFERS.map(({ product, previewPrice }, index) => {
          const offer = getCampaignPriceBySlug(product.slug, 'active');
          if (!offer || offer.compareAt === null) return null;
          const currentPrice = offer.compareAt;
          const discount = offer.discountPercent;
          const href = PRODUCT_ROUTE_BY_SLUG[product.slug as ProductPublicRouteKey] ?? '/';

          return (
            <article key={product.slug} className={`bf-sale-card bf-sale-card-${index + 1}`}>
              <div className="bf-sale-card-index">{String(index + 1).padStart(2, '0')}</div>
              <span className="bf-discount">{discount}% off</span>
              <figure className="bf-sale-card-media">
                <img src={product.image} alt={`${product.name} product artwork`} loading="lazy" decoding="async" />
              </figure>
              <div className="bf-sale-card-copy">
                <p>{product.productSeries ?? product.productCategory}</p>
                <h3>{product.name}</h3>
                <div className="bf-sale-card-price" aria-label={`${product.name} Black Friday pricing`}>
                  <strong>{formatUsdPrice(previewPrice)}</strong>
                  <del aria-label={`Current price ${formatUsdPrice(currentPrice)}`}>{formatUsdPrice(currentPrice)}</del>
                  <small>Black Friday · USD</small>
                </div>
                <Link href={href}>View product <span aria-hidden="true">↗</span></Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
