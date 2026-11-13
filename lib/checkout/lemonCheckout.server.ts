import 'server-only';

import type { OfficialProduct } from '@/lib/products/catalog';
import { LemonApiError, lemonApiPost, lemonApiRequest } from '@/lib/payments/lemonApi.server';
import {
  buildVerifiedCheckoutPayload,
  CheckoutPriceError,
  getLemonPriceTaxMode,
  validateLemonCatalogPrice,
  validateLemonCheckoutPreview,
  type CheckoutPriceExpectation
} from './priceValidation';

function asCheckoutError(error: unknown): never {
  if (error instanceof CheckoutPriceError) throw error;
  throw new CheckoutPriceError('PRICE_CHECK_UNAVAILABLE',
    error instanceof LemonApiError ? `LEMON_API_${error.status}` : 'LEMON_API_UNAVAILABLE');
}

export async function verifyLemonProductPrice(product: OfficialProduct, priceCents: number): Promise<CheckoutPriceExpectation> {
  const storeId = process.env.LEMON_STORE_ID?.trim();
  if (!storeId) throw new CheckoutPriceError('PRICE_CHECK_UNAVAILABLE', 'STORE_NOT_CONFIGURED');
  const expected: CheckoutPriceExpectation = {
    storeId,
    productId: product.lemonProductId,
    variantId: product.lemonVariantId,
    priceCents,
    currency: 'USD',
    checkoutHost: new URL(product.lemonCheckoutUrl).host,
    taxMode: getLemonPriceTaxMode(process.env.LEMON_PRICE_TAX_MODE?.trim())
  };
  try {
    const [store, productResponse, variant, prices] = await Promise.all([
      lemonApiRequest(`/stores/${encodeURIComponent(storeId)}`),
      lemonApiRequest(`/products/${encodeURIComponent(product.lemonProductId)}`),
      lemonApiRequest(`/variants/${encodeURIComponent(product.lemonVariantId)}`),
      lemonApiRequest(`/prices?${new URLSearchParams({ 'filter[variant_id]': product.lemonVariantId, 'page[size]': '1' })}`)
    ]);
    const variantStatus = (variant as { data?: { attributes?: { status?: unknown } } } | null)?.data?.attributes?.status;
    const productVariants = variantStatus === 'pending'
      ? await lemonApiRequest(`/variants?${new URLSearchParams({ 'filter[product_id]': product.lemonProductId, 'page[size]': '2' })}`)
      : undefined;
    validateLemonCatalogPrice({ store, product: productResponse, variant, prices, productVariants }, expected);
    return expected;
  } catch (error) {
    return asCheckoutError(error);
  }
}

export async function createVerifiedLemonCheckout(
  expected: CheckoutPriceExpectation,
  input: { email: string; claimToken: string; expiresAt: string }
) {
  try {
    const response = await lemonApiPost('/checkouts', buildVerifiedCheckoutPayload(expected, input));
    return validateLemonCheckoutPreview(response, expected, { ...input, nowMs: Date.now() });
  } catch (error) {
    return asCheckoutError(error);
  }
}
