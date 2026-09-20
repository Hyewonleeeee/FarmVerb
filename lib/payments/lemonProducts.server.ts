import 'server-only';

import {
  getOfficialProductByLiveVariantId,
  type OfficialProductSlug
} from '@/lib/products/catalog';

export type PurchaseProductSlug = OfficialProductSlug;

export function getProductSlugByVariantId(variantId: string | number | null | undefined) {
  if (variantId === null || variantId === undefined) {
    return null;
  }

  return getOfficialProductByLiveVariantId(variantId)?.slug ?? null;
}
