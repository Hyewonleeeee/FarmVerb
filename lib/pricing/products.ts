export type ProductPricing = {
  currency: 'KRW';
  regularPrice: number;
  launchPrice?: number;
  defaultPrice?: number;
  salePrice?: number;
  saleActive?: boolean;
};

const glitchSaleActive = process.env.NEXT_PUBLIC_GLITCH_SALE_ACTIVE === 'true';

const PRICING_BY_PRODUCT_NAME: Record<string, ProductPricing> = {
  'Glitch Drum Pack Vol.1': {
    currency: 'KRW',
    regularPrice: 99000,
    defaultPrice: 49000,
    salePrice: 40000,
    saleActive: glitchSaleActive
  },
  'Nebula Crush': {
    currency: 'KRW',
    launchPrice: 39000,
    regularPrice: 59000
  },
  'Nebula Space': {
    currency: 'KRW',
    launchPrice: 59000,
    regularPrice: 79000
  },
  'Nebula Drums': {
    currency: 'KRW',
    launchPrice: 49000,
    regularPrice: 59000
  },
  'Germinate': {
    currency: 'KRW',
    launchPrice: 49000,
    regularPrice: 69000
  },
  'Jeju Citrus Air': {
    currency: 'KRW',
    launchPrice: 49000,
    regularPrice: 69000
  },
  'Boseong Green Tea': {
    currency: 'KRW',
    launchPrice: 39000,
    regularPrice: 59000
  }
};

export function getProductPricing(productName: string): ProductPricing | null {
  return PRICING_BY_PRODUCT_NAME[productName] ?? null;
}

export function getMainProductPrice(pricing: ProductPricing): number {
  if (typeof pricing.defaultPrice === 'number') {
    return pricing.defaultPrice;
  }

  if (typeof pricing.launchPrice === 'number') {
    return pricing.launchPrice;
  }

  return pricing.regularPrice;
}

export function getLimitedSalePrice(pricing: ProductPricing): number | null {
  if (!pricing.saleActive || typeof pricing.salePrice !== 'number') {
    return null;
  }

  return pricing.salePrice;
}

export function formatKrwPrice(value: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0
  }).format(value);
}
