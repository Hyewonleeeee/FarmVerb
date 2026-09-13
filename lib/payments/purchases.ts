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

export type AccountPurchase = Pick<
  PurchaseRecord,
  | 'id'
  | 'product_slug'
  | 'product_name'
  | 'lemon_order_id'
  | 'total_cents'
  | 'currency'
  | 'purchased_at'
  | 'status'
>;

export type PurchaseLicenseInstance = {
  id: string;
  identifier: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseLicense = {
  id: string;
  orderItemId: string | null;
  productId: string | null;
  productName: string | null;
  variantName: string | null;
  key: string;
  keyShort: string;
  status: string;
  activationLimit: number | null;
  instancesCount: number;
  instances: PurchaseLicenseInstance[];
  expiresAt: string | null;
};

export type PurchaseDownloadCategory = 'macos' | 'windows' | 'manual' | 'other';

export type PurchaseDownloadFile = {
  id: string;
  name: string;
  displayName: string;
  extension: string | null;
  category: PurchaseDownloadCategory;
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

export type PurchaseLicenseInstancesResponse = {
  ok: true;
  licenseId: string;
  instances: PurchaseLicenseInstance[];
};

export type PurchaseLicenseInstanceDeactivateResponse = PurchaseLicenseInstancesResponse & {
  deactivatedInstanceIdentifier: string;
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
