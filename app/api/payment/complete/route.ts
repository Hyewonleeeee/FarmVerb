import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

function generateLicenseKey(productSlug: SupportedProductSlug): string {
  const prefix = productSlug.toUpperCase().slice(0, 4);
  const random = crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 12);
  return `${prefix}-${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8, 12)}`;
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { slug?: string; paymentId?: string } = {};
  try {
    body = (await request.json()) as { slug?: string; paymentId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const requestedSlug = normalizeSlug(body.slug || 'germinate');
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';

  if (!(requestedSlug in SUPPORTED_PRODUCTS)) {
    return NextResponse.json(
      { error: 'Unsupported product. Currently only Germinate is available.' },
      { status: 400 }
    );
  }

  if (!paymentId) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
  }

  const { data: productRecord, error: productError } = await supabase
    .from('products')
    .select('id, name, slug, is_active')
    .eq('slug', requestedSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (!productRecord) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 });
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .maybeSingle();

  if (existingOrderError) {
    return NextResponse.json({ error: existingOrderError.message }, { status: 500 });
  }

  if (!existingOrder) {
    const { error: orderInsertError } = await supabase.from('orders').insert({
      user_id: user.id,
      product_id: productRecord.id
    });

    if (orderInsertError) {
      return NextResponse.json({ error: orderInsertError.message }, { status: 500 });
    }
  }

  const { data: existingLicense, error: existingLicenseError } = await supabase
    .from('licenses')
    .select('id, license_key')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .maybeSingle();

  if (existingLicenseError) {
    return NextResponse.json({ error: existingLicenseError.message }, { status: 500 });
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
      return NextResponse.json({ error: licenseInsertError.message }, { status: 500 });
    }

    licenseKey = insertedLicense.license_key;
  }

  return NextResponse.json({
    ok: true,
    product: productRecord.name,
    paymentId,
    licenseKey
  });
}

