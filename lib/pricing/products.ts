export type ProductPricing = {
  currency: 'USD';
  regularPrice: number;
  launchPrice?: number;
  defaultPrice?: number;
  salePrice?: number;
  saleActive?: boolean;
};

const glitchSaleActive = process.env.NEXT_PUBLIC_GLITCH_SALE_ACTIVE === 'true';

const PRICING_BY_PRODUCT_NAME: Record<string, ProductPricing> = {
  'Glitch Drum Pack Vol.1': {
    currency: 'USD',
    regularPrice: 99,
    defaultPrice: 49,
    salePrice: 40,
    saleActive: glitchSaleActive
  },
  'Nebula Crush': {
    currency: 'USD',
    launchPrice: 39,
    regularPrice: 59
  },
  'Nebula Space': {
    currency: 'USD',
    launchPrice: 59,
    regularPrice: 79
  },
  'Nebula Drums': {
    currency: 'USD',
    launchPrice: 49,
    regularPrice: 59
  },
  'Germinate': {
    currency: 'USD',
    launchPrice: 49,
    regularPrice: 69
  },
  'Jeju Citrus Air': {
    currency: 'USD',
    launchPrice: 49,
    regularPrice: 69
  },
  'Boseong Green Tea': {
    currency: 'USD',
    launchPrice: 39,
    regularPrice: 59
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

export function formatUsdPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}
