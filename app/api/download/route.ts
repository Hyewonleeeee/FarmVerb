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
    return NextResponse.json(
      { error: 'Unsupported product. Currently only Germinate is available for download.' },
      { status: 400 }
    );
  }

  const { data: productRecord, error: productError } = await supabase
    .from('products')
    .select('id, name, slug, file_path, is_active')
    .eq('slug', requestedSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (!productRecord || !productRecord.file_path) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 });
  }

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .limit(1);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'Purchase required for this product.' }, { status: 403 });
  }

  const { data: licenses, error: licensesError } = await supabase
    .from('licenses')
    .select('id, license_key')
    .eq('user_id', user.id)
    .eq('product_id', productRecord.id)
    .limit(1);

  if (licensesError) {
    return NextResponse.json({ error: licensesError.message }, { status: 500 });
  }

  if (!licenses || licenses.length === 0) {
    return NextResponse.json({ error: 'License required for this product.' }, { status: 403 });
  }

  return NextResponse.json({
    downloadUrl: productRecord.file_path
  });
}
