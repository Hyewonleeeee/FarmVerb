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
    return NextResponse.json({
      ok: true,
      alreadyProcessed: true,
      order: existingOrder
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
        return NextResponse.json({
          ok: true,
          alreadyProcessed: true,
          order: raceExistingOrder,
          payment: tossPayload
        });
      }
    }

    return jsonError(500, 'DATABASE_ERROR', 'Failed to save order.', insertError.message);
  }

  return NextResponse.json({
    ok: true,
    alreadyProcessed: false,
    payment: tossPayload,
    order: insertedOrder
  });
}
