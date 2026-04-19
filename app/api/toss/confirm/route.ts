import { NextResponse } from 'next/server';

type ConfirmRequestBody = {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
};

export async function POST(request: Request) {
  const tossSecretKey = process.env.TOSS_SECRET_KEY;

  if (!tossSecretKey) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: 'MISSING_TOSS_SECRET_KEY',
        message: 'Server is missing TOSS_SECRET_KEY.'
      },
      { status: 500 }
    );
  }

  let body: ConfirmRequestBody = {};
  try {
    body = (await request.json()) as ConfirmRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errorCode: 'INVALID_REQUEST_BODY',
        message: 'Invalid request body.'
      },
      { status: 400 }
    );
  }

  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey.trim() : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const amount = typeof body.amount === 'number' ? body.amount : NaN;

  if (!paymentKey || !orderId || Number.isNaN(amount)) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: 'MISSING_REQUIRED_FIELDS',
        message: 'paymentKey, orderId, and amount are required.'
      },
      { status: 400 }
    );
  }

  const authorization = Buffer.from(`${tossSecretKey}:`).toString('base64');

  try {
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

    const payload = (await tossResponse.json().catch(() => null)) as Record<string, unknown> | null;

    if (!tossResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          errorCode: (payload?.code as string) ?? 'TOSS_CONFIRM_FAILED',
          message: (payload?.message as string) ?? 'Payment approval failed.',
          detail: payload
        },
        { status: tossResponse.status }
      );
    }

    return NextResponse.json({
      ok: true,
      payment: payload
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Could not reach Toss Payments confirm API.'
      },
      { status: 502 }
    );
  }
}
