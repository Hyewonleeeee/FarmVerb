import { NextResponse } from 'next/server';
import { validateSignupPayload } from '@/lib/auth/signup-validation';

export async function POST(request: Request) {
  let body: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    password?: string;
    country?: string;
  } = {};

  try {
    body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      country?: string;
    };
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: 'Please enter your real name in English.'
      },
      { status: 400 }
    );
  }

  const validation = validateSignupPayload({
    firstName: body.firstName ?? '',
    lastName: body.lastName ?? '',
    name: body.name ?? '',
    email: body.email ?? '',
    password: body.password ?? '',
    country: body.country ?? ''
  });

  if (!validation.valid) {
    return NextResponse.json(
      {
        ok: false,
        message:
          validation.errors.firstName ??
          validation.errors.lastName ??
          validation.errors.email ??
          validation.errors.password ??
          'Invalid signup details.',
        fieldErrors: validation.errors
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    normalized: validation.normalized
  });
}
