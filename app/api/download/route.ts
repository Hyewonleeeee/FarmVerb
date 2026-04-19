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

function downloadError(code: PaymentApiErrorCode, status: number, detail?: string) {
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
    return downloadError('UNAUTHORIZED', 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return downloadError('SERVER_CONFIG_ERROR', 500);
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
    return downloadError('UNAUTHORIZED', 401, userError?.message);
  }

  let requestedSlug = 'germinate';
  try {
    const body = (await request.json()) as { slug?: string };
    if (typeof body?.slug === 'string' && body.slug.trim()) {
      requestedSlug = body.slug.trim().toLowerCase();
    }
  } catch {
    // Keep default slug when no JSON body is provided.
  }

  if (!(requestedSlug in SUPPORTED_PRODUCTS)) {
    return downloadError('UNSUPPORTED_PRODUCT', 400);
  }

  const { data: productRecord, error: productError } = await supabase
    .from('products')
    .select('id, name, slug, file_path, is_active')
    .eq('slug', requestedSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (productError) {
    return downloadError('DATABASE_ERROR', 500, productError.message);
  }

  if (!productRecord || !productRecord.file_path) {
    return downloadError('PRODUCT_NOT_AVAILABLE', 404);
  }

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .limit(1);

  if (ordersError) {
    return downloadError('DATABASE_ERROR', 500, ordersError.message);
  }

  if (!orders || orders.length === 0) {
    return downloadError('PURCHASE_REQUIRED', 403);
  }

  const { data: licenses, error: licensesError } = await supabase
    .from('licenses')
    .select('id, license_key')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .limit(1);

  if (licensesError) {
    return downloadError('DATABASE_ERROR', 500, licensesError.message);
  }

  if (!licenses || licenses.length === 0) {
    return downloadError('LICENSE_REQUIRED', 403);
  }

  return NextResponse.json({
    downloadUrl: productRecord.file_path
  });
}
