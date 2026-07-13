import 'server-only';

export type PurchaseProductSlug =
  | 'nebula-series'
  | 'nebula-crush'
  | 'nebula-space'
  | 'nebula-drift'
  | 'nebula-rift'
  | 'nebula-drums'
  | 'glitch-drum-pack-vol-1';

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
  { slug: 'glitch-drum-pack-vol-1', variantIds: process.env.LEMON_VARIANT_GLITCH_DRUM_PACK_VOL_1 }
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
