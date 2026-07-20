export type PurchaseStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partial_refund'
  | 'fraudulent';

export type PurchaseRecord = {
  id: string;
  user_id: string | null;
  buyer_email: string;
  product_slug: string | null;
  product_name: string;
  lemon_order_id: string;
  lemon_variant_id: string | null;
  total_cents: number;
  currency: string;
  test_mode: boolean;
  lemon_license_key: string | null;
  download_url: string | null;
  purchased_at: string;
  status: PurchaseStatus;
  created_at: string;
  updated_at: string;
};

export type PurchaseLicense = {
  id: string;
  orderItemId: string | null;
  productId: string | null;
  key: string;
  keyShort: string;
  status: string;
  activationLimit: number | null;
  instancesCount: number;
  expiresAt: string | null;
};

export type PurchaseDownloadFile = {
  id: string;
  name: string;
  extension: string | null;
  size: number | null;
  version: string | null;
};

export type PurchaseDownloadGroup = {
  orderItemId: string;
  productId: string | null;
  variantId: string;
  productName: string;
  variantName: string | null;
  files: PurchaseDownloadFile[];
};

export type PurchaseLicensesResponse = {
  ok: true;
  licenses: PurchaseLicense[];
};

export type PurchaseDownloadsResponse = {
  ok: true;
  groups: PurchaseDownloadGroup[];
};

export type PurchaseDownloadUrlResponse = {
  ok: true;
  downloadUrl: string;
  file: PurchaseDownloadFile;
};

// Kept as an alias so future purchase-related code can migrate without a breaking rename.
export type FuturePurchaseRecord = PurchaseRecord;
