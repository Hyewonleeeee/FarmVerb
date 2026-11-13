'use client';

import Link from 'next/link';
import { useBlackFridayPreview } from '@/components/campaigns/BlackFridayPreviewProvider';
import {
  BLACK_FRIDAY_2026,
  getBlackFriday2026FeaturedOffers,
  type BlackFridayPreviewVariant
} from '@/lib/campaigns/blackFriday2026';
import { formatUsdPrice, getMainProductPrice, getProductPricing } from '@/lib/pricing/products';
import { PRODUCT_PUBLIC_PATHS, type ProductPublicRouteKey } from '@/lib/ui/farmVerbRoutes';

const FEATURED_OFFERS = getBlackFriday2026FeaturedOffers();

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
  const { enabled, variant } = useBlackFridayPreview();
  if (!enabled) {
    return null;
  }

  return (
    <aside className={`bf-notice-bar bf-notice-bar-${variant}`} aria-label="Black Friday preview notice">
      <span className="bf-notice-mark">FARMVERB</span>
      <span className="bf-notice-event">Black Friday 2026</span>
      <span className="bf-notice-date">{BLACK_FRIDAY_2026.displayDates}</span>
      <span className="bf-notice-preview">
        <span className="bf-notice-preview-desktop">Design preview · Checkout disabled</span>
        <span className="bf-notice-preview-mobile">Preview only</span>
      </span>
    </aside>
  );
}

export function BlackFridayVariantSwitcher() {
  const { enabled, variant, setVariant } = useBlackFridayPreview();
  if (!enabled) {
    return null;
  }

  const variants: Array<{ id: BlackFridayPreviewVariant; label: string; name: string }> = [
    { id: 'editorial', label: 'A', name: 'Dark Editorial' },
    { id: 'product', label: 'B', name: 'Product Focus' }
  ];

  return (
    <aside className="bf-variant-switcher" aria-label="Black Friday design variants">
      <span className="bf-variant-switcher-label">Preview direction</span>
      <div className="bf-variant-switcher-options">
        {variants.map((item) => (
          <button
            key={item.id}
            type="button"
            className={variant === item.id ? 'is-active' : ''}
            aria-pressed={variant === item.id}
            onClick={() => setVariant(item.id)}
          >
            <span>{item.label}</span>
            {item.name}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function BlackFridayHero() {
  const { variant } = useBlackFridayPreview();

  return (
    <section className={`bf-hero bf-hero-variant-${variant}`} aria-labelledby="black-friday-heading">
      <div className="bf-hero-grid">
        <div className="bf-hero-copy">
          <p className="bf-hero-eyebrow">FarmVerb presents</p>
          <h1 id="black-friday-heading">
            <span>Black</span>
            <span>Friday</span>
            <span className="bf-hero-year">2026</span>
          </h1>
          <p className="bf-hero-intro">
            A focused selection of FarmVerb instruments, effects, and sound tools — prepared for a limited seasonal event.
          </p>
          <div className="bf-hero-meta">
            <span>{BLACK_FRIDAY_2026.displayDates}</span>
            <span>Preview pricing</span>
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
              <div className="bf-hero-product-frame">
                <img src={product.image} alt={`${product.name} product artwork`} />
              </div>
              <figcaption>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {product.name}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="bf-hero-footnote" aria-label="Preview status">
        <span>Campaign study {variant === 'editorial' ? 'A — Dark Editorial' : 'B — Product Focus'}</span>
        <span>All product imagery is original FarmVerb artwork</span>
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
          <h2 id="black-friday-sale-heading">Five tools. One focused window.</h2>
        </div>
        <div className="bf-sale-heading-note">
          <span>{BLACK_FRIDAY_2026.displayDates}</span>
          <p>Prices shown here are for campaign design review only. Checkout is disabled in this Preview.</p>
        </div>
      </header>

      <div className="bf-sale-grid">
        {FEATURED_OFFERS.map(({ product, previewPrice }, index) => {
          const pricing = getProductPricing(product.pricingName);
          const currentPrice = pricing ? getMainProductPrice(pricing) : product.fallbackPrice;
          const href = PRODUCT_ROUTE_BY_SLUG[product.slug as ProductPublicRouteKey] ?? '/';

          return (
            <article key={product.slug} className={`bf-sale-card bf-sale-card-${index + 1}`}>
              <div className="bf-sale-card-index">{String(index + 1).padStart(2, '0')}</div>
              <figure className="bf-sale-card-media">
                <img src={product.image} alt={`${product.name} product artwork`} />
              </figure>
              <div className="bf-sale-card-copy">
                <p>{product.productSeries ?? product.productCategory}</p>
                <h3>{product.name}</h3>
                <div className="bf-sale-card-price" aria-label={`${product.name} preview pricing`}>
                  <strong>{formatUsdPrice(previewPrice)}</strong>
                  <span>{formatUsdPrice(currentPrice)}</span>
                  <small>Preview price · USD</small>
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
