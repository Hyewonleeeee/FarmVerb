'use client';

import { useBlackFridayPreview } from './BlackFridayPreviewProvider';
import {
  BLACK_FRIDAY_2026,
  getBlackFriday2026DiscountPercent,
  getBlackFriday2026PriceBySlug
} from '@/lib/campaigns/blackFriday2026';
import { getOfficialProductByName } from '@/lib/products/catalog';
import { formatUsdPrice, getMainProductPrice, getProductPricing } from '@/lib/pricing/products';
import styles from './BlackFridayPurchasePanel.module.css';

function getPreviewOffer(productName: string) {
  const product = getOfficialProductByName(productName);
  if (!product) return null;

  const pricing = getProductPricing(product.pricingName);
  const price = getBlackFriday2026PriceBySlug(product.slug);
  if (!pricing || price === null) return null;

  const currentPrice = getMainProductPrice(pricing);
  return {
    product,
    price,
    currentPrice,
    discount: getBlackFriday2026DiscountPercent(currentPrice, price)
  };
}

export function BlackFridayPrice({
  productName,
  compact = false
}: {
  productName: string;
  compact?: boolean;
}) {
  const { enabled } = useBlackFridayPreview();
  const offer = enabled ? getPreviewOffer(productName) : null;
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

export default function BlackFridayPurchasePanel({ productName }: { productName: string }) {
  const { enabled } = useBlackFridayPreview();
  const offer = enabled ? getPreviewOffer(productName) : null;
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
        <button type="button" className={styles.buyButton} disabled>Buy Now</button>
        <button type="button" className={styles.cartButton} disabled>Add to Cart</button>
      </div>
      <span className={styles.deadline}>
        Offer ends <time dateTime={BLACK_FRIDAY_2026.endsOn}>{endDate}</time>
      </span>
    </div>
  );
}
