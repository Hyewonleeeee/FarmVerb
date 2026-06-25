export type FuturePurchaseStatus = 'pending' | 'paid' | 'refunded' | 'cancelled' | 'failed';

export type FuturePurchaseRecord = {
  id: string;
  user_id: string;
  buyer_email: string;
  product_slug: string;
  product_name: string;
  lemon_order_id: string;
  lemon_variant_id: string | null;
  lemon_license_key: string | null;
  download_url: string | null;
  purchased_at: string;
  status: FuturePurchaseStatus;
};

// TODO: Move My Account / Orders to the purchases table once Lemon Squeezy webhooks are connected.
