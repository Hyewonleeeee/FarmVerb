import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPaymentApiErrorMessage, type PaymentApiErrorCode } from '@/lib/i18n/payment';

const SUPPORTED_PRODUCTS = {
  germinate: true
} as const;

type SupportedProductSlug = keyof typeof SUPPORTED_PRODUCTS;

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function normalizeSlug(rawValue: unknown): string {
  if (typeof rawValue !== 'string') {
    return '';
  }
  return rawValue.trim().toLowerCase();
}

function normalizeCurrency(rawValue: unknown): string {
  if (typeof rawValue !== 'string') {
    return 'KRW';
  }

  const normalized = rawValue.trim().toUpperCase();
  return normalized.length === 3 ? normalized : 'KRW';
}

function normalizeUnitPrice(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || Number.isNaN(rawValue) || rawValue < 0) {
    return 0;
  }

  return Math.round(rawValue * 100) / 100;
}

function generateOrderNumber() {
  const stamp = Date.now().toString().slice(-8);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `FV-${stamp}-${rand}`;
}

function generateLicenseKey(productSlug: SupportedProductSlug): string {
  const prefix = productSlug.toUpperCase().slice(0, 4);
  const random = crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12);
  return `${prefix}-${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8, 12)}`;
}

function paymentError(code: PaymentApiErrorCode, status: number, detail?: string) {
  return NextResponse.json(
    {
      ok: false,
      errorCode: code,
      error: getPaymentApiErrorMessage(code),
      detail: detail ?? null
    },
    { status }
  );
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return paymentError('UNAUTHORIZED', 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return paymentError('SERVER_CONFIG_ERROR', 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return paymentError('UNAUTHORIZED', 401, userError?.message);
  }

  let body: { slug?: string; paymentId?: string; currency?: string; unitPrice?: number } = {};
  try {
    body = (await request.json()) as { slug?: string; paymentId?: string; currency?: string; unitPrice?: number };
  } catch {
    return paymentError('INVALID_REQUEST_BODY', 400);
  }

  const requestedSlug = normalizeSlug(body.slug || 'germinate');
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
  const currency = normalizeCurrency(body.currency);
  const unitPrice = normalizeUnitPrice(body.unitPrice);

  if (!(requestedSlug in SUPPORTED_PRODUCTS)) {
    return paymentError('UNSUPPORTED_PRODUCT', 400);
  }

  if (!paymentId) {
    return paymentError('MISSING_PAYMENT_ID', 400);
  }

  const { data: productRecord, error: productError } = await supabase
    .from('products')
    .select('id, name, slug, is_active')
    .eq('slug', requestedSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (productError) {
    return paymentError('DATABASE_ERROR', 500, productError.message);
  }

  if (!productRecord) {
    return paymentError('PRODUCT_NOT_AVAILABLE', 404);
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .maybeSingle();

  if (existingOrderError) {
    return paymentError('DATABASE_ERROR', 500, existingOrderError.message);
  }

  let orderId = existingOrder?.id ?? null;

  if (!orderId) {
    const { data: insertedOrder, error: orderInsertError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        product_id: productRecord.id,
        order_number: generateOrderNumber(),
        payment_status: 'paid',
        currency,
        transaction_id: paymentId
      })
      .select('id')
      .single();

    if (orderInsertError) {
      return paymentError('DATABASE_ERROR', 500, orderInsertError.message);
    }

    orderId = insertedOrder.id;
  }

  const { data: existingOrderItem, error: orderItemCheckError } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)
    .eq('product_id', productRecord.id)
    .maybeSingle();

  if (orderItemCheckError) {
    return paymentError('DATABASE_ERROR', 500, orderItemCheckError.message);
  }

  if (!existingOrderItem) {
    const { error: orderItemInsertError } = await supabase.from('order_items').insert({
      order_id: orderId,
      product_id: productRecord.id,
      quantity: 1,
      unit_price: unitPrice,
      currency
    });

    if (orderItemInsertError) {
      return paymentError('DATABASE_ERROR', 500, orderItemInsertError.message);
    }
  }

  const { data: existingLicense, error: existingLicenseError } = await supabase
    .from('licenses')
    .select('id, license_key')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .maybeSingle();

  if (existingLicenseError) {
    return paymentError('DATABASE_ERROR', 500, existingLicenseError.message);
  }

  let licenseKey = existingLicense?.license_key ?? '';
  if (!existingLicense) {
    const newLicenseKey = generateLicenseKey(requestedSlug as SupportedProductSlug);

    const { data: insertedLicense, error: licenseInsertError } = await supabase
      .from('licenses')
      .insert({
        user_id: user.id,
        product_id: productRecord.id,
        license_key: newLicenseKey
      })
      .select('license_key')
      .single();

    if (licenseInsertError) {
      return paymentError('DATABASE_ERROR', 500, licenseInsertError.message);
    }

    licenseKey = insertedLicense.license_key;
  }

  return NextResponse.json({
    ok: true,
    product: productRecord.name,
    paymentId,
    orderId,
    currency,
    unitPrice,
    licenseKey
  });
}
