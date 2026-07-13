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

// Kept as an alias so future purchase-related code can migrate without a breaking rename.
export type FuturePurchaseRecord = PurchaseRecord;
