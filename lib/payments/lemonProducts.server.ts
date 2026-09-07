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
  { slug: 'organic-series', variantIds: process.env.LEMON_VARIANT_ORGANIC_SERIES?.trim() || '2090544' },
  { slug: 'jeju-citrus-air', variantIds: process.env.LEMON_VARIANT_JEJU_CITRUS_AIR?.trim() || '2090266' },
  { slug: 'boseong-green-tea', variantIds: process.env.LEMON_VARIANT_BOSEONG_GREEN_TEA?.trim() || '2090274' },
  { slug: 'uiseong-garlic', variantIds: process.env.LEMON_VARIANT_UISEONG_GARLIC?.trim() || '2090280' }
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
