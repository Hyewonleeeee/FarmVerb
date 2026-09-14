import 'server-only';

import type {
  PurchaseDownloadCategory,
  PurchaseDownloadFile,
  PurchaseDownloadGroup,
  PurchaseLicense,
  PurchaseLicenseInstance,
  PurchaseRecord
} from '@/lib/payments/purchases';
import { isEntitledPurchaseStatus } from '@/lib/payments/purchases';
import {
  LemonApiError,
  lemonApiRequest,
  lemonLicenseApiRequest
} from '@/lib/payments/lemonApi.server';
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
  variant_id?: number | string;
  key?: string;
  key_short?: string;
  status?: string;
  activation_limit?: number | null;
  instances_count?: number;
  expires_at?: string | null;
};

type LemonLicenseInstanceAttributes = {
  license_key_id?: number | string;
  identifier?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
};

type LemonLicenseDeactivateResponse = {
  deactivated?: boolean;
  error?: string | null;
  license_key?: {
    id?: number | string;
  };
  meta?: {
    order_id?: number | string;
  };
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
  | 'id'
  | 'user_id'
  | 'product_slug'
  | 'lemon_order_id'
  | 'lemon_variant_id'
  | 'status'
  | 'test_mode'
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

  if (!isEntitledPurchaseStatus(order.attributes.status ?? '')) {
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
    .select('id, user_id, product_slug, lemon_order_id, lemon_variant_id, status, test_mode')
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
  if (!isEntitledPurchaseStatus(purchase.status)) {
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

async function getOwnedLicenseResources(purchase: OwnedPurchase) {
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
    .filter((license) => Boolean(license.attributes.key));
}

function toLicenseInstance(
  instance: JsonApiResource<LemonLicenseInstanceAttributes>
): PurchaseLicenseInstance | null {
  const identifier = instance.attributes.identifier?.trim();
  if (!identifier) {
    return null;
  }

  return {
    id: instance.id,
    identifier,
    name: instance.attributes.name?.trim() || 'Activated device',
    createdAt: instance.attributes.created_at ?? '',
    updatedAt: instance.attributes.updated_at ?? instance.attributes.created_at ?? ''
  };
}

async function getLicenseInstancesForKey(licenseId: string): Promise<PurchaseLicenseInstance[]> {
  const query = new URLSearchParams({
    'filter[license_key_id]': licenseId,
    'page[size]': '100'
  });

  let response: JsonApiList<LemonLicenseInstanceAttributes>;
  try {
    response = await lemonApiRequest<JsonApiList<LemonLicenseInstanceAttributes>>(
      `/license-key-instances?${query.toString()}`
    );
  } catch (error) {
    return toPublicLemonError(error);
  }

  return response.data
    .filter((instance) => toStringId(instance.attributes.license_key_id) === licenseId)
    .map(toLicenseInstance)
    .filter((instance): instance is PurchaseLicenseInstance => Boolean(instance));
}

async function requireOwnedLicenseResource(purchase: OwnedPurchase, licenseId: string) {
  const licenses = await getOwnedLicenseResources(purchase);
  const license = licenses.find((candidate) => candidate.id === licenseId);
  if (!license) {
    throw new EntitlementError('License not found.', 404, 'LICENSE_NOT_FOUND');
  }

  return license;
}

export async function getPurchaseLicenses(purchase: OwnedPurchase): Promise<PurchaseLicense[]> {
  const licenses = await getOwnedLicenseResources(purchase);
  if (licenses.length === 0) {
    return [];
  }

  const [orderItems, instanceLists] = await Promise.all([
    getOrderItems(purchase),
    Promise.all(licenses.map((license) => getLicenseInstancesForKey(license.id)))
  ]);
  const orderItemsById = new Map(orderItems.map((item) => [item.id, item]));

  return licenses.map((license, index) => {
    const orderItemId = toStringId(license.attributes.order_item_id);
    const orderItem = orderItemId ? orderItemsById.get(orderItemId) : undefined;

    return {
      id: license.id,
      orderItemId,
      productId: toStringId(license.attributes.product_id),
      productName: orderItem?.attributes.product_name?.trim() || null,
      variantName: orderItem?.attributes.variant_name?.trim() || null,
      key: license.attributes.key ?? '',
      keyShort: license.attributes.key_short ?? '',
      status: license.attributes.status ?? 'unknown',
      activationLimit: license.attributes.activation_limit ?? null,
      instancesCount: license.attributes.instances_count ?? 0,
      instances: instanceLists[index],
      expiresAt: license.attributes.expires_at ?? null
    };
  });
}

export async function getPurchaseLicenseInstances(
  purchase: OwnedPurchase,
  licenseId: string
): Promise<PurchaseLicenseInstance[]> {
  await requireOwnedLicenseResource(purchase, licenseId);
  return getLicenseInstancesForKey(licenseId);
}

export async function deactivatePurchaseLicenseInstance(
  purchase: OwnedPurchase,
  licenseId: string,
  instanceIdentifier: string
): Promise<PurchaseLicenseInstance[]> {
  const license = await requireOwnedLicenseResource(purchase, licenseId);
  const instances = await getLicenseInstancesForKey(licenseId);
  const instance = instances.find((candidate) => candidate.identifier === instanceIdentifier);

  if (!instance) {
    throw new EntitlementError('Device not found.', 404, 'INSTANCE_NOT_FOUND');
  }

  let response: LemonLicenseDeactivateResponse;
  try {
    response = await lemonLicenseApiRequest<LemonLicenseDeactivateResponse>('/licenses/deactivate', {
      license_key: license.attributes.key ?? '',
      instance_id: instance.identifier
    });
  } catch (error) {
    if (error instanceof LemonApiError && [400, 404, 422].includes(error.status)) {
      throw new EntitlementError(
        'This device could not be deactivated. Refresh and try again.',
        409,
        'INSTANCE_DEACTIVATION_FAILED'
      );
    }
    return toPublicLemonError(error);
  }

  const responseLicenseId = toStringId(response.license_key?.id);
  const responseOrderId = toStringId(response.meta?.order_id);
  if (!response.deactivated || responseLicenseId !== license.id || responseOrderId !== purchase.lemon_order_id) {
    throw new EntitlementError(
      'The device deactivation response could not be verified.',
      409,
      'INSTANCE_DEACTIVATION_MISMATCH'
    );
  }

  return getLicenseInstancesForKey(licenseId);
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

function normalizeFileExtension(file: JsonApiResource<LemonFileAttributes>) {
  const declaredExtension = file.attributes.extension?.trim().toLowerCase().replace(/^\./, '');
  if (declaredExtension) {
    return declaredExtension;
  }

  const fileName = (file.attributes.name ?? file.attributes.identifier ?? '').trim();
  const extensionMatch = fileName.match(/\.([a-z0-9]+)$/i);
  return extensionMatch?.[1]?.toLowerCase() ?? null;
}

function getDownloadCategory(extension: string | null): PurchaseDownloadCategory {
  if (extension === 'pkg') {
    return 'macos';
  }
  if (extension === 'exe') {
    return 'windows';
  }
  if (extension === 'pdf') {
    return 'manual';
  }
  return 'other';
}

function getDownloadDisplayName(name: string, extension: string | null) {
  if (!extension || name.toLowerCase().endsWith(`.${extension}`)) {
    return name;
  }
  return `${name}.${extension}`;
}

function toDownloadFile(file: JsonApiResource<LemonFileAttributes>): PurchaseDownloadFile {
  const extension = normalizeFileExtension(file);
  const name = (file.attributes.name ?? file.attributes.identifier ?? `File ${file.id}`).trim();
  return {
    id: file.id,
    name,
    displayName: getDownloadDisplayName(name, extension),
    extension,
    category: getDownloadCategory(extension),
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

  const categoryOrder: Record<PurchaseDownloadCategory, number> = {
    macos: 0,
    windows: 1,
    manual: 2,
    other: 3
  };

  return groups
    .filter((group): group is PurchaseDownloadGroup => Boolean(group))
    .map((group) => ({
      ...group,
      files: [...group.files].sort((left, right) => {
        return categoryOrder[left.category] - categoryOrder[right.category]
          || left.displayName.localeCompare(right.displayName);
      })
    }))
    .sort((left, right) => {
      const leftIsPrimary = left.variantId === purchase.lemon_variant_id;
      const rightIsPrimary = right.variantId === purchase.lemon_variant_id;
      return Number(rightIsPrimary) - Number(leftIsPrimary);
    });
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
