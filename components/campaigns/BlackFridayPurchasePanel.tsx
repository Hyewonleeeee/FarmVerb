'use client';

import { useBlackFridayPreview } from './BlackFridayPreviewProvider';
import { BLACK_FRIDAY_2026 } from '@/lib/campaigns/blackFriday2026';
import { getCampaignPriceBySlug } from '@/lib/campaigns/blackFridayPricing';
import LemonCheckoutLink from '@/components/checkout/LemonCheckoutLink';
import PurchasePolicyNotice from '@/components/farmverb/PurchasePolicyNotice';
import { getOfficialProductByName } from '@/lib/products/catalog';
import { formatUsdPrice } from '@/lib/pricing/products';
import styles from './BlackFridayPurchasePanel.module.css';

function getPreviewOffer(productName: string) {
  const product = getOfficialProductByName(productName);
  if (!product) return null;

  const pricing = getCampaignPriceBySlug(product.slug, 'active');
  if (!pricing || pricing.compareAt === null) return null;
  return {
    product,
    price: pricing.price,
    currentPrice: pricing.compareAt,
    discount: pricing.discountPercent
  };
}

export function BlackFridayPrice({
  productName,
  compact = false
}: {
  productName: string;
  compact?: boolean;
}) {
  const { saleActive } = useBlackFridayPreview();
  const offer = saleActive ? getPreviewOffer(productName) : null;
  if (!offer) return null;

  return (
    <div
      className={`${styles.priceBlock} ${compact ? styles.compact : ''}`.trim()}
      aria-label={`${offer.product.name} pricing`}
      data-bf-price={offer.product.slug}
    >
      <div className={styles.currentPrice}>
        <strong className={styles.amount}>{formatUsdPrice(offer.price)}</strong>
        <span className={styles.currency}>USD</span>
      </div>
      <div className={styles.comparison}>
        <del className={styles.previousPrice} aria-label={`Previous price ${formatUsdPrice(offer.currentPrice)}`}>
          {formatUsdPrice(offer.currentPrice)}
        </del>
        {offer.discount > 0 ? <span className={styles.discount}>{offer.discount}% off</span> : null}
      </div>
    </div>
  );
}

export default function BlackFridayPurchasePanel({ productName, onAddToCart }: {
  productName: string;
  onAddToCart: (productName: string) => void;
}) {
  const { previewMode, saleActive, clockReady } = useBlackFridayPreview();
  const offer = saleActive ? getPreviewOffer(productName) : null;
  if (!offer) return null;

  const tone = offer.product.productSeries === 'Organic Series'
    ? styles.organic
    : offer.product.productCategory === 'Sample Pack'
      ? styles.glitch
      : styles.nebula;
  const endDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${BLACK_FRIDAY_2026.endsOn}T00:00:00Z`));

  return (
    <div
      className={`${styles.purchasePanel} ${tone}`}
      role="group"
      aria-label={`${offer.product.name} purchase options`}
      data-bf-purchase={offer.product.slug}
    >
      <BlackFridayPrice productName={productName} />
      <div className={styles.actions}>
        <LemonCheckoutLink productName={productName} className={styles.buyButton}>Buy Now</LemonCheckoutLink>
        <button type="button" className={styles.cartButton} disabled={previewMode || !clockReady}
          onClick={() => onAddToCart(productName)}>Add to Cart</button>
      </div>
      <span className={styles.deadline}>
        Offer ends <time dateTime={BLACK_FRIDAY_2026.endsOn}>{endDate}</time>
      </span>
      {!previewMode ? <PurchasePolicyNotice /> : null}
    </div>
  );
}
