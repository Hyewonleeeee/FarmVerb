import { getMainProductPrice, getProductPricing } from '@/lib/pricing/products';
import {
  getOfficialProductByName,
  getOfficialProductBySlug,
  type OfficialProduct
} from '@/lib/products/catalog';
import type { AnalyticsProduct } from '@/lib/analytics/ecommerce';

function toAnalyticsProduct(product: OfficialProduct): AnalyticsProduct {
  const pricing = getProductPricing(product.pricingName);

  return {
    productName: product.name,
    productSlug: product.slug,
    productCategory: product.productCategory,
    productSeries: product.productSeries,
    price: pricing ? getMainProductPrice(pricing) : product.fallbackPrice,
    currency: product.currency
  };
}

export function getAnalyticsProductByName(productName: string) {
  const product = getOfficialProductByName(productName);
  return product ? toAnalyticsProduct(product) : null;
}

export function getAnalyticsProductBySlug(productSlug: string) {
  const product = getOfficialProductBySlug(productSlug);
  return product ? toAnalyticsProduct(product) : null;
}
