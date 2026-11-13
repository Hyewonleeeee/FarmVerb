import { getMainProductPrice, getProductPricing } from '@/lib/pricing/products';
import {
  getOfficialProductByName,
  getOfficialProductBySlug,
  type OfficialProduct
} from '@/lib/products/catalog';
import type { AnalyticsProduct } from '@/lib/analytics/ecommerce';
import type { CampaignPhase } from '@/lib/campaigns/blackFridayClock';
import { getCampaignPriceBySlug } from '@/lib/campaigns/blackFridayPricing';

function toAnalyticsProduct(product: OfficialProduct, phase?: CampaignPhase): AnalyticsProduct {
  const pricing = getProductPricing(product.pricingName);
  const campaignPrice = phase ? getCampaignPriceBySlug(product.slug, phase) : null;

  return {
    productName: product.name,
    productSlug: product.slug,
    productCategory: product.productCategory,
    productSeries: product.productSeries,
    price: campaignPrice?.price ?? (pricing ? getMainProductPrice(pricing) : product.fallbackPrice),
    currency: product.currency
  };
}

export function getAnalyticsProductByName(productName: string, phase?: CampaignPhase) {
  const product = getOfficialProductByName(productName);
  return product ? toAnalyticsProduct(product, phase) : null;
}

export function getAnalyticsProductBySlug(productSlug: string, phase?: CampaignPhase) {
  const product = getOfficialProductBySlug(productSlug);
  return product ? toAnalyticsProduct(product, phase) : null;
}
