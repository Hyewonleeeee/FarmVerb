export type ProductPricing = {
  currency: 'USD';
  regularPrice: number;
  launchPrice?: number;
  defaultPrice?: number;
  salePrice?: number;
  saleActive?: boolean;
};

export type ProductData = ProductPricing & {
  youtubeVideoId?: string;
};

const glitchSaleActive = process.env.NEXT_PUBLIC_GLITCH_SALE_ACTIVE === 'true';

const PRODUCT_NAME_ALIASES: Record<string, string> = {
  'Nebula Series': 'Nebula Series Bundle',
  'Organic Series': 'Organic Series Bundle'
};

const PRODUCT_DATA_BY_PRODUCT_NAME: Record<string, ProductData> = {
  'Nebula Series Bundle': {
    currency: 'USD',
    launchPrice: 189,
    regularPrice: 255
  },
  'Glitch Drum Pack Vol.1': {
    currency: 'USD',
    regularPrice: 99,
    defaultPrice: 49,
    salePrice: 40,
    saleActive: glitchSaleActive,
    youtubeVideoId: '_y4nx3WViI4'
  },
  'Nebula Crush': {
    currency: 'USD',
    launchPrice: 39,
    regularPrice: 59,
    youtubeVideoId: 'bBMgHURSguY'
  },
  'Nebula Space': {
    currency: 'USD',
    launchPrice: 59,
    regularPrice: 79,
    youtubeVideoId: 'Jut9LH1BAXo'
  },
  'Nebula Drift': {
    currency: 'USD',
    launchPrice: 49,
    regularPrice: 69,
    youtubeVideoId: 'VE7s3_-_1i4'
  },
  'Nebula Rift': {
    currency: 'USD',
    launchPrice: 59,
    regularPrice: 79,
    youtubeVideoId: 'SNlqyr_8APo'
  },
  'Nebula Drums': {
    currency: 'USD',
    launchPrice: 49,
    regularPrice: 59,
    youtubeVideoId: '7rXF8HeFUkM'
  },
  'Germinate': {
    currency: 'USD',
    launchPrice: 49,
    regularPrice: 69
  },
  'Jeju Citrus Air': {
    currency: 'USD',
    launchPrice: 29,
    regularPrice: 39
  },
  'Boseong Green Tea': {
    currency: 'USD',
    launchPrice: 29,
    regularPrice: 39
  },
  'Uiseong Garlic': {
    currency: 'USD',
    launchPrice: 29,
    regularPrice: 39
  },
  'Organic Series Bundle': {
    currency: 'USD',
    launchPrice: 69,
    regularPrice: 89
  }
};

export function getProductData(productName: string): ProductData | null {
  const canonicalName = PRODUCT_NAME_ALIASES[productName] ?? productName;
  return PRODUCT_DATA_BY_PRODUCT_NAME[canonicalName] ?? null;
}

export function getProductPricing(productName: string): ProductPricing | null {
  return getProductData(productName);
}

export function getProductYoutubeVideoId(productName: string): string | null {
  return getProductData(productName)?.youtubeVideoId ?? null;
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
