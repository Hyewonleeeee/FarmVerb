export type OfficialProductDefinition = {
  slug: string;
  name: string;
  aliases: readonly string[];
  pricingName: string;
  description: string;
  fallbackPrice: number;
  currency: 'USD';
  image: string;
  lemonProductId: string;
  lemonVariantId: string;
  lemonCheckoutUrl: string;
};

/**
 * The products FarmVerb currently sells in Lemon Squeezy Live Mode.
 *
 * Product and variant IDs are intentionally kept here rather than inferred from
 * names or database slugs. Account ownership is valid only when a non-test
 * purchase matches one of these Live variant IDs.
 */
export const OFFICIAL_PRODUCT_CATALOG = [
  {
    slug: 'boseong-green-tea',
    name: 'Boseong Green Tea',
    aliases: [],
    pricingName: 'Boseong Green Tea',
    description: 'Focused richness processor',
    fallbackPrice: 29,
    currency: 'USD',
    image: '/Organic%20Series/Main-Boseong.png',
    lemonProductId: '1374767',
    lemonVariantId: '2147845',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/8d702347-5def-438e-a681-4ada9fe702e1'
  },
  {
    slug: 'glitch-drum-pack-vol-1',
    name: 'Glitch Drum Pack Vol. I',
    aliases: ['Glitch Drum Pack Vol.1', 'Glitch Drum Pack Vol I'],
    pricingName: 'Glitch Drum Pack Vol.1',
    description: 'Digital glitch drum sample pack',
    fallbackPrice: 49,
    currency: 'USD',
    image: '/GlitchDrum/GlitchDrum.png',
    lemonProductId: '1374752',
    lemonVariantId: '2147826',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/5983cdbe-af8a-4932-be36-89f7307e16bd'
  },
  {
    slug: 'jeju-citrus-air',
    name: 'Jeju Citrus Air',
    aliases: [],
    pricingName: 'Jeju Citrus Air',
    description: 'Octave-led shimmer reverb',
    fallbackPrice: 29,
    currency: 'USD',
    image: '/Organic%20Series/Main-Jeju.png',
    lemonProductId: '1374753',
    lemonVariantId: '2147827',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/dc65c3ee-2348-4039-a1cb-b1fe8e4a4694'
  },
  {
    slug: 'nebula-crush',
    name: 'Nebula Crush',
    aliases: [],
    pricingName: 'Nebula Crush',
    description: 'Dynamic crush processor',
    fallbackPrice: 39,
    currency: 'USD',
    image: '/Nebula%20Series/Main/1-Nebula%20Crush.png',
    lemonProductId: '1374754',
    lemonVariantId: '2147828',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/72985479-12b9-4bf5-8f02-84b7a60b4e0c'
  },
  {
    slug: 'nebula-drift',
    name: 'Nebula Drift',
    aliases: [],
    pricingName: 'Nebula Drift',
    description: 'Spectral motion processor',
    fallbackPrice: 49,
    currency: 'USD',
    image: '/Nebula%20Series/Main/3-Nebula%20Drift.png',
    lemonProductId: '1374755',
    lemonVariantId: '2147829',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/5a68911c-c0ba-4bf6-807d-dd78a31520b1'
  },
  {
    slug: 'nebula-drums',
    name: 'Nebula Drums',
    aliases: ['Nebula Drum'],
    pricingName: 'Nebula Drums',
    description: 'Decent Sampler instrument',
    fallbackPrice: 49,
    currency: 'USD',
    image: '/Nebula%20Series/Main/5-Nebula%20Drums.png',
    lemonProductId: '1374756',
    lemonVariantId: '2147830',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/226ebc50-5879-48f7-9560-163dc23bcc54'
  },
  {
    slug: 'nebula-rift',
    name: 'Nebula Rift',
    aliases: [],
    pricingName: 'Nebula Rift',
    description: 'Fractured digital processor',
    fallbackPrice: 59,
    currency: 'USD',
    image: '/Nebula%20Series/Main/4-Nebula%20Rift.png',
    lemonProductId: '1374757',
    lemonVariantId: '2147831',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/0197cf2b-4c3c-4c28-9dcb-33d061160365'
  },
  {
    slug: 'nebula-series',
    name: 'Nebula Series Bundle',
    aliases: ['Nebula Series'],
    pricingName: 'Nebula Series Bundle',
    description: 'Complete Nebula effects bundle',
    fallbackPrice: 189,
    currency: 'USD',
    image: '/Nebula%20Series/Main/Nebula%20Series.png',
    lemonProductId: '1374758',
    lemonVariantId: '2147832',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/f12bef41-a257-4c73-b8f6-7f3af1ef53c3'
  },
  {
    slug: 'nebula-space',
    name: 'Nebula Space',
    aliases: [],
    pricingName: 'Nebula Space',
    description: 'Atmospheric space processor',
    fallbackPrice: 59,
    currency: 'USD',
    image: '/Nebula%20Series/Main/2-Nebula%20Space.png',
    lemonProductId: '1374760',
    lemonVariantId: '2147834',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/bd73f5bb-7d34-4d33-93b1-91a14f9c723a'
  },
  {
    slug: 'organic-series',
    name: 'Organic Series Bundle',
    aliases: ['Organic Series'],
    pricingName: 'Organic Series Bundle',
    description: 'Jeju Citrus Air, Boseong Green Tea, and Uiseong Garlic',
    fallbackPrice: 69,
    currency: 'USD',
    image: '/Organic%20Series/Organic%20Series%20Bundle.png',
    lemonProductId: '1374761',
    lemonVariantId: '2147835',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/041e549a-37f7-4610-afed-89019cc45a3c'
  },
  {
    slug: 'uiseong-garlic',
    name: 'Uiseong Garlic',
    aliases: [],
    pricingName: 'Uiseong Garlic',
    description: 'Forward definition processor',
    fallbackPrice: 29,
    currency: 'USD',
    image: '/Organic%20Series/Main-Uiseong.png',
    lemonProductId: '1374762',
    lemonVariantId: '2147836',
    lemonCheckoutUrl: 'https://farmverb.lemonsqueezy.com/checkout/buy/1841c648-5793-4e43-8089-da5dae603f78'
  }
] as const satisfies readonly OfficialProductDefinition[];

export type OfficialProduct = (typeof OFFICIAL_PRODUCT_CATALOG)[number];
export type OfficialProductSlug = OfficialProduct['slug'];

const productBySlug = new Map<string, OfficialProduct>(
  OFFICIAL_PRODUCT_CATALOG.map((product) => [product.slug, product])
);

const productByName = new Map<string, OfficialProduct>();
const productByLiveVariantId = new Map<string, OfficialProduct>();

for (const product of OFFICIAL_PRODUCT_CATALOG) {
  for (const name of [product.name, ...product.aliases]) {
    productByName.set(name.trim().toLowerCase(), product);
  }
  productByLiveVariantId.set(product.lemonVariantId, product);
}

export const OFFICIAL_LIVE_VARIANT_IDS = Object.freeze(
  OFFICIAL_PRODUCT_CATALOG.map((product) => product.lemonVariantId)
);

export function getOfficialProductBySlug(slug: string | null | undefined) {
  const normalizedSlug = slug?.trim().toLowerCase();
  return normalizedSlug ? productBySlug.get(normalizedSlug) ?? null : null;
}

export function getOfficialProductByName(name: string | null | undefined) {
  const normalizedName = name?.trim().toLowerCase();
  return normalizedName ? productByName.get(normalizedName) ?? null : null;
}

export function getOfficialProductByLiveVariantId(variantId: string | number | null | undefined) {
  if (variantId === null || variantId === undefined) {
    return null;
  }

  const normalizedVariantId = String(variantId).trim();
  return normalizedVariantId ? productByLiveVariantId.get(normalizedVariantId) ?? null : null;
}

export function getOfficialProductForLivePurchase(input: {
  lemon_variant_id: string | number | null | undefined;
  test_mode: boolean | null | undefined;
}) {
  if (input.test_mode !== false) {
    return null;
  }

  return getOfficialProductByLiveVariantId(input.lemon_variant_id);
}
