import 'server-only';

import type {
  PurchaseDownloadFile,
  PurchaseDownloadGroup,
  PurchaseLicense,
  PurchaseRecord
} from '@/lib/payments/purchases';
import { LemonApiError, lemonApiRequest } from '@/lib/payments/lemonApi.server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type JsonApiResource<TAttributes> = {
  type: string;
  id: string;
  attributes: TAttributes;
};

type JsonApiSingle<TAttributes> = {
  data: JsonApiResource<TAttributes>;
};

type JsonApiList<TAttributes> = {
  data: Array<JsonApiResource<TAttributes>>;
};

type LemonOrderAttributes = {
  store_id?: number | string;
  status?: string;
  test_mode?: boolean;
};

type LemonOrderItemAttributes = {
  order_id?: number | string;
  product_id?: number | string;
  variant_id?: number | string;
  product_name?: string;
  variant_name?: string;
};

type LemonLicenseAttributes = {
  order_id?: number | string;
  order_item_id?: number | string;
  product_id?: number | string;
  key?: string;
  key_short?: string;
  status?: string;
  activation_limit?: number | null;
  instances_count?: number;
  expires_at?: string | null;
};

type LemonFileAttributes = {
  variant_id?: number | string;
  identifier?: string;
  name?: string;
  extension?: string | null;
  download_url?: string;
  size?: number | null;
  version?: string | null;
  status?: string;
  test_mode?: boolean;
};

type OwnedPurchase = Pick<
  PurchaseRecord,
  'id' | 'user_id' | 'lemon_order_id' | 'lemon_variant_id' | 'status' | 'test_mode'
>;

export class EntitlementError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: string | null;

  constructor(message: string, status: number, code: string, retryAfter: string | null = null) {
    super(message);
    this.name = 'EntitlementError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
}

function toStringId(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function toPublicLemonError(error: unknown): never {
  if (error instanceof LemonApiError) {
    if (error.status === 429) {
      throw new EntitlementError(
        'Lemon Squeezy is receiving too many requests. Please try again shortly.',
        429,
        'LEMON_RATE_LIMITED',
        error.retryAfter
      );
    }

    if (error.status === 401 || error.status === 403) {
      throw new EntitlementError('Purchase services are not configured correctly.', 502, 'LEMON_AUTH_ERROR');
    }

    if (error.status === 404) {
      throw new EntitlementError('The purchase could not be verified with Lemon Squeezy.', 502, 'LEMON_NOT_FOUND');
    }

    if (error.status === 500 && error.message === 'Lemon Squeezy API is not configured.') {
      throw new EntitlementError(error.message, 500, 'LEMON_NOT_CONFIGURED');
    }

    throw new EntitlementError('Lemon Squeezy is temporarily unavailable.', 502, 'LEMON_UNAVAILABLE');
  }

  throw error;
}

async function getVerifiedLemonOrder(purchase: OwnedPurchase) {
  let response: JsonApiSingle<LemonOrderAttributes>;
  try {
    response = await lemonApiRequest<JsonApiSingle<LemonOrderAttributes>>(`/orders/${encodeURIComponent(purchase.lemon_order_id)}`);
  } catch (error) {
    return toPublicLemonError(error);
  }

  const order = response.data;
  if (order.id !== purchase.lemon_order_id) {
    throw new EntitlementError('The Lemon Squeezy order does not match this purchase.', 409, 'ORDER_MISMATCH');
  }

  if (order.attributes.status !== 'paid') {
    throw new EntitlementError('This order is not currently eligible for downloads.', 409, 'ORDER_NOT_PAID');
  }

  if (Boolean(order.attributes.test_mode) !== purchase.test_mode) {
    throw new EntitlementError('The purchase environment does not match the Lemon Squeezy order.', 409, 'ORDER_MODE_MISMATCH');
  }

  const configuredStoreId = process.env.LEMON_STORE_ID?.trim();
  if (configuredStoreId && String(order.attributes.store_id ?? '') !== configuredStoreId) {
    throw new EntitlementError('The Lemon Squeezy order does not belong to this store.', 409, 'ORDER_STORE_MISMATCH');
  }

  return order;
}

export async function requireOwnedPurchase(request: Request, purchaseId: string) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw new EntitlementError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  let supabase: ReturnType<typeof createServerSupabaseClient>;
  try {
    supabase = createServerSupabaseClient();
  } catch {
    throw new EntitlementError('Purchase services are not configured.', 500, 'SUPABASE_NOT_CONFIGURED');
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    throw new EntitlementError('Invalid or expired session.', 401, 'INVALID_SESSION');
  }

  const { data, error } = await supabase
    .from('purchases')
    .select('id, user_id, lemon_order_id, lemon_variant_id, status, test_mode')
    .eq('id', purchaseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[Purchase Entitlements] Failed to load owned purchase.', {
      userId: user.id,
      purchaseId,
      code: error.code
    });
    throw new EntitlementError('Could not verify purchase ownership.', 500, 'PURCHASE_LOOKUP_FAILED');
  }

  if (!data) {
    // A 404 avoids revealing whether another user owns the supplied purchase ID.
    throw new EntitlementError('Purchase not found.', 404, 'PURCHASE_NOT_FOUND');
  }

  const purchase = data as OwnedPurchase;
  if (purchase.status !== 'paid') {
    throw new EntitlementError('This purchase is not currently eligible.', 409, 'PURCHASE_NOT_PAID');
  }

  await getVerifiedLemonOrder(purchase);
  return purchase;
}

async function getOrderItems(purchase: OwnedPurchase) {
  const query = new URLSearchParams({
    'filter[order_id]': purchase.lemon_order_id,
    'page[size]': '100'
  });

  let response: JsonApiList<LemonOrderItemAttributes>;
  try {
    response = await lemonApiRequest<JsonApiList<LemonOrderItemAttributes>>(`/order-items?${query.toString()}`);
  } catch (error) {
    return toPublicLemonError(error);
  }

  return response.data.filter(
    (item) => toStringId(item.attributes.order_id) === purchase.lemon_order_id
  );
}

export async function getPurchaseLicenses(purchase: OwnedPurchase): Promise<PurchaseLicense[]> {
  const query = new URLSearchParams({
    'filter[order_id]': purchase.lemon_order_id,
    'page[size]': '100'
  });

  let response: JsonApiList<LemonLicenseAttributes>;
  try {
    response = await lemonApiRequest<JsonApiList<LemonLicenseAttributes>>(`/license-keys?${query.toString()}`);
  } catch (error) {
    return toPublicLemonError(error);
  }

  return response.data
    .filter((license) => toStringId(license.attributes.order_id) === purchase.lemon_order_id)
    .filter((license) => Boolean(license.attributes.key))
    .map((license) => ({
      id: license.id,
      orderItemId: toStringId(license.attributes.order_item_id),
      productId: toStringId(license.attributes.product_id),
      key: license.attributes.key ?? '',
      keyShort: license.attributes.key_short ?? '',
      status: license.attributes.status ?? 'unknown',
      activationLimit: license.attributes.activation_limit ?? null,
      instancesCount: license.attributes.instances_count ?? 0,
      expiresAt: license.attributes.expires_at ?? null
    }));
}

async function getFilesForVariant(variantId: string) {
  const query = new URLSearchParams({
    'filter[variant_id]': variantId,
    'page[size]': '100'
  });

  let response: JsonApiList<LemonFileAttributes>;
  try {
    response = await lemonApiRequest<JsonApiList<LemonFileAttributes>>(`/files?${query.toString()}`);
  } catch (error) {
    return toPublicLemonError(error);
  }

  return response.data.filter((file) => toStringId(file.attributes.variant_id) === variantId);
}

function toDownloadFile(file: JsonApiResource<LemonFileAttributes>): PurchaseDownloadFile {
  return {
    id: file.id,
    name: file.attributes.name ?? file.attributes.identifier ?? `File ${file.id}`,
    extension: file.attributes.extension ?? null,
    size: file.attributes.size ?? null,
    version: file.attributes.version ?? null
  };
}

function isAvailableFile(file: JsonApiResource<LemonFileAttributes>, purchase: OwnedPurchase) {
  return file.attributes.status === 'published' && Boolean(file.attributes.test_mode) === purchase.test_mode;
}

export async function getPurchaseDownloadGroups(purchase: OwnedPurchase): Promise<PurchaseDownloadGroup[]> {
  const orderItems = await getOrderItems(purchase);
  const fallbackVariantId = purchase.lemon_variant_id;
  const effectiveItems = orderItems.length > 0
    ? orderItems
    : fallbackVariantId
      ? [{
          type: 'order-items',
          id: `purchase-${purchase.id}`,
          attributes: {
            order_id: purchase.lemon_order_id,
            variant_id: fallbackVariantId,
            product_name: 'FarmVerb Product'
          }
        }]
      : [];

  const groups = await Promise.all(
    effectiveItems.map(async (item) => {
      const variantId = toStringId(item.attributes.variant_id);
      if (!variantId) {
        return null;
      }

      const files = (await getFilesForVariant(variantId))
        .filter((file) => isAvailableFile(file, purchase))
        .map(toDownloadFile);

      return {
        orderItemId: item.id,
        productId: toStringId(item.attributes.product_id),
        variantId,
        productName: item.attributes.product_name ?? 'FarmVerb Product',
        variantName: item.attributes.variant_name ?? null,
        files
      } satisfies PurchaseDownloadGroup;
    })
  );

  return groups.filter((group): group is PurchaseDownloadGroup => Boolean(group));
}

export async function getFreshPurchaseDownload(
  purchase: OwnedPurchase,
  fileId: string
): Promise<{ file: PurchaseDownloadFile; downloadUrl: string }> {
  const orderItems = await getOrderItems(purchase);
  const allowedVariantIds = new Set(
    orderItems
      .map((item) => toStringId(item.attributes.variant_id))
      .filter((variantId): variantId is string => Boolean(variantId))
  );

  if (purchase.lemon_variant_id) {
    allowedVariantIds.add(purchase.lemon_variant_id);
  }

  let response: JsonApiSingle<LemonFileAttributes>;
  try {
    response = await lemonApiRequest<JsonApiSingle<LemonFileAttributes>>(`/files/${encodeURIComponent(fileId)}`);
  } catch (error) {
    return toPublicLemonError(error);
  }

  const file = response.data;
  const fileVariantId = toStringId(file.attributes.variant_id);
  if (!fileVariantId || !allowedVariantIds.has(fileVariantId)) {
    throw new EntitlementError('This file does not belong to the selected purchase.', 404, 'FILE_NOT_OWNED');
  }

  if (!isAvailableFile(file, purchase) || !file.attributes.download_url) {
    throw new EntitlementError('This download is not currently available.', 409, 'FILE_UNAVAILABLE');
  }

  return {
    file: toDownloadFile(file),
    downloadUrl: file.attributes.download_url
  };
}
