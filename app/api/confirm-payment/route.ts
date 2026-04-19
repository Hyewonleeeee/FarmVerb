import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ConfirmPaymentRequestBody = {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
};

type OrderRow = {
  id: string;
  user_id: string;
  product_name: string;
  amount: number;
  order_id: string;
  created_at: string;
};

type LicenseRow = {
  id: string;
  user_id: string;
  product_name: string;
  license_key: string;
  order_id: string;
  created_at: string;
};

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

function jsonError(status: number, errorCode: string, message: string, detail: string | null = null) {
  return NextResponse.json(
    {
      ok: false,
      errorCode,
      message,
      detail
    },
    { status }
  );
}

async function findExistingOrder(supabase: any, userId: string, orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, user_id, product_name, amount, order_id, created_at')
    .eq('user_id', userId)
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    return { order: null, error };
  }

  return { order: data ?? null, error: null };
}

async function findExistingLicense(supabase: any, userId: string, orderId: string) {
  const { data, error } = await supabase
    .from('licenses')
    .select('id, user_id, product_name, license_key, order_id, created_at')
    .eq('user_id', userId)
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    return { license: null, error };
  }

  return { license: (data as LicenseRow | null) ?? null, error: null };
}

function generateLicenseKey(productName: string) {
  const compact = productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const code = (compact.slice(0, 4) || 'PROD').padEnd(4, 'X');
  const token = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return `FV-${code}-${token.slice(0, 4)}-${token.slice(4, 8)}`;
}

async function ensureLicenseForOrder(
  supabase: any,
  userId: string,
  productName: string,
  orderId: string
) {
  const { license: existingLicense, error: existingLicenseError } = await findExistingLicense(supabase, userId, orderId);
  if (existingLicenseError) {
    return { license: null, error: existingLicenseError };
  }

  if (existingLicense) {
    return { license: existingLicense, error: null };
  }

  const { data: insertedLicense, error: insertLicenseError } = await supabase
    .from('licenses')
    .insert({
      user_id: userId,
      product_name: productName,
      license_key: generateLicenseKey(productName),
      order_id: orderId,
      created_at: new Date().toISOString()
    })
    .select('id, user_id, product_name, license_key, order_id, created_at')
    .maybeSingle();

  if (insertLicenseError) {
    if (insertLicenseError.code === '23505') {
      const { license: raceExistingLicense, error: raceLicenseError } = await findExistingLicense(
        supabase,
        userId,
        orderId
      );
      if (raceLicenseError) {
        return { license: null, error: raceLicenseError };
      }

      return { license: raceExistingLicense, error: null };
    }

    return { license: null, error: insertLicenseError };
  }

  return { license: (insertedLicense as LicenseRow | null) ?? null, error: null };
}

export async function POST(request: Request) {
  const tossSecretKey = process.env.TOSS_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!tossSecretKey) {
    return jsonError(500, 'MISSING_TOSS_SECRET_KEY', 'Server is missing TOSS_SECRET_KEY.');
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError(
      500,
      'MISSING_SUPABASE_CONFIG',
      'Server is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return jsonError(401, 'UNAUTHORIZED', 'Login required.');
  }

  let body: ConfirmPaymentRequestBody = {};
  try {
    body = (await request.json()) as ConfirmPaymentRequestBody;
  } catch {
    return jsonError(400, 'INVALID_REQUEST_BODY', 'Invalid request body.');
  }

  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey.trim() : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const amount = typeof body.amount === 'number' ? body.amount : NaN;

  if (!paymentKey || !orderId || Number.isNaN(amount)) {
    return jsonError(400, 'MISSING_REQUIRED_FIELDS', 'paymentKey, orderId, and amount are required.');
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
    return jsonError(401, 'UNAUTHORIZED', 'Could not verify the logged-in user.', userError?.message ?? null);
  }

  const { order: existingOrder, error: existingOrderError } = await findExistingOrder(supabase, user.id, orderId);
  if (existingOrderError) {
    return jsonError(500, 'DATABASE_ERROR', 'Failed to check existing order.', existingOrderError.message);
  }

  if (existingOrder) {
    const { license: existingLicense, error: existingLicenseError } = await ensureLicenseForOrder(
      supabase,
      user.id,
      existingOrder.product_name,
      existingOrder.order_id
    );

    if (existingLicenseError) {
      return jsonError(500, 'DATABASE_ERROR', 'Failed to check existing license.', existingLicenseError.message);
    }

    return NextResponse.json({
      ok: true,
      alreadyProcessed: true,
      order: existingOrder,
      license: existingLicense
    });
  }

  const authorization = Buffer.from(`${tossSecretKey}:`).toString('base64');

  const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount
    }),
    cache: 'no-store'
  });

  const tossPayload = (await tossResponse.json().catch(() => null)) as Record<string, unknown> | null;

  if (!tossResponse.ok) {
    return jsonError(
      tossResponse.status,
      (tossPayload?.code as string) ?? 'TOSS_CONFIRM_FAILED',
      (tossPayload?.message as string) ?? 'Payment approval failed.'
    );
  }

  const productNameFromToss = typeof tossPayload?.orderName === 'string' ? tossPayload.orderName.trim() : '';
  const paidAmount = typeof tossPayload?.totalAmount === 'number' ? tossPayload.totalAmount : amount;

  const newOrder = {
    user_id: user.id,
    product_name: productNameFromToss || 'Unknown Product',
    amount: paidAmount,
    order_id: orderId,
    created_at: new Date().toISOString()
  };

  const { data: insertedOrder, error: insertError } = await supabase
    .from('orders')
    .insert(newOrder)
    .select('id, user_id, product_name, amount, order_id, created_at')
    .maybeSingle();

  if (insertError) {
    if (insertError.code === '23505') {
      const { order: raceExistingOrder, error: raceCheckError } = await findExistingOrder(supabase, user.id, orderId);
      if (raceCheckError) {
        return jsonError(500, 'DATABASE_ERROR', 'Failed to load duplicate order.', raceCheckError.message);
      }

      if (raceExistingOrder) {
        const { license: raceExistingLicense, error: raceLicenseError } = await ensureLicenseForOrder(
          supabase,
          user.id,
          raceExistingOrder.product_name,
          raceExistingOrder.order_id
        );

        if (raceLicenseError) {
          return jsonError(500, 'DATABASE_ERROR', 'Failed to load duplicate license.', raceLicenseError.message);
        }

        return NextResponse.json({
          ok: true,
          alreadyProcessed: true,
          order: raceExistingOrder,
          payment: tossPayload,
          license: raceExistingLicense
        });
      }
    }

    return jsonError(500, 'DATABASE_ERROR', 'Failed to save order.', insertError.message);
  }

  if (!insertedOrder) {
    return jsonError(500, 'DATABASE_ERROR', 'Order insert succeeded but no row was returned.');
  }

  const orderedProductName = insertedOrder?.product_name ?? productNameFromToss ?? 'Unknown Product';
  const { license: issuedLicense, error: issuedLicenseError } = await ensureLicenseForOrder(
    supabase,
    user.id,
    orderedProductName,
    insertedOrder.order_id
  );

  if (issuedLicenseError) {
    return jsonError(500, 'DATABASE_ERROR', 'Failed to issue license.', issuedLicenseError.message);
  }

  return NextResponse.json({
    ok: true,
    alreadyProcessed: false,
    payment: tossPayload,
    order: insertedOrder,
    license: issuedLicense
  });
}
