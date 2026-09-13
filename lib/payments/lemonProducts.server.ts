import 'server-only';

export type PurchaseProductSlug =
  | 'nebula-series'
  | 'nebula-crush'
  | 'nebula-space'
  | 'nebula-drift'
  | 'nebula-rift'
  | 'nebula-drums'
  | 'glitch-drum-pack-vol-1'
  | 'organic-series'
  | 'jeju-citrus-air'
  | 'boseong-green-tea'
  | 'uiseong-garlic';

type ProductVariantConfig = {
  slug: PurchaseProductSlug;
  variantIds: string | undefined;
};

const productVariantConfigs: ProductVariantConfig[] = [
  { slug: 'nebula-series', variantIds: process.env.LEMON_VARIANT_NEBULA_SERIES },
  { slug: 'nebula-crush', variantIds: process.env.LEMON_VARIANT_NEBULA_CRUSH },
  { slug: 'nebula-space', variantIds: process.env.LEMON_VARIANT_NEBULA_SPACE },
  { slug: 'nebula-drift', variantIds: process.env.LEMON_VARIANT_NEBULA_DRIFT },
  { slug: 'nebula-rift', variantIds: process.env.LEMON_VARIANT_NEBULA_RIFT },
  { slug: 'nebula-drums', variantIds: process.env.LEMON_VARIANT_NEBULA_DRUMS },
  { slug: 'glitch-drum-pack-vol-1', variantIds: process.env.LEMON_VARIANT_GLITCH_DRUM_PACK_VOL_1 },
  {
    slug: 'organic-series',
    variantIds: [process.env.LEMON_VARIANT_ORGANIC_SERIES, '2090544'].filter(Boolean).join(',')
  },
  {
    slug: 'jeju-citrus-air',
    variantIds: [process.env.LEMON_VARIANT_JEJU_CITRUS_AIR, '2090266'].filter(Boolean).join(',')
  },
  {
    slug: 'boseong-green-tea',
    variantIds: [process.env.LEMON_VARIANT_BOSEONG_GREEN_TEA, '2090274'].filter(Boolean).join(',')
  },
  {
    slug: 'uiseong-garlic',
    variantIds: [process.env.LEMON_VARIANT_UISEONG_GARLIC, '2090280'].filter(Boolean).join(',')
  }
];

function parseVariantIds(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((variantId) => variantId.trim())
    .filter(Boolean);
}

export function getProductSlugByVariantId(variantId: string | number | null | undefined) {
  if (variantId === null || variantId === undefined) {
    return null;
  }

  const normalizedVariantId = String(variantId).trim();
  if (!normalizedVariantId) {
    return null;
  }

  for (const config of productVariantConfigs) {
    if (parseVariantIds(config.variantIds).includes(normalizedVariantId)) {
      return config.slug;
    }
  }

  return null;
}
