export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getSafeAuthRedirectPath(search: string) {
  const redirectPath = new URLSearchParams(search).get('redirect');

  if (!redirectPath || !redirectPath.startsWith('/') || redirectPath.startsWith('//')) {
    return '/mypage';
  }

  try {
    const resolvedUrl = new URL(redirectPath, 'https://farmverb.com');
    if (resolvedUrl.origin !== 'https://farmverb.com') {
      return '/mypage';
    }

    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return '/mypage';
  }
}

export function getEmailOtpErrorMessage(error: unknown, action: 'send' | 'verify' = 'send') {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (message.includes('Missing Supabase environment variables')) {
    return 'Email sign-in is not configured correctly. Please check the Supabase environment variables.';
  }

  if (message.includes('Invalid NEXT_PUBLIC_SUPABASE_URL')) {
    return 'Email sign-in is not configured correctly. Please check the Supabase project URL.';
  }

  if (/rate limit|too many requests|email rate limit/i.test(message)) {
    return 'Too many code requests. Please wait before trying again.';
  }

  if (/expired/i.test(message)) {
    return 'This code has expired. Please request a new code.';
  }

  if (/invalid.*(token|otp)|token.*invalid|otp.*invalid|incorrect/i.test(message)) {
    return 'The code is incorrect. Please check your email and try again.';
  }

  if (/failed to fetch|fetch failed|networkerror|load failed|supabase unavailable/i.test(message)) {
    return 'Could not reach Supabase Auth. Please check your connection and try again.';
  }

  if (action === 'verify') {
    return message || 'Could not verify this code. It may be incorrect or expired.';
  }

  return message || 'Could not send the sign-in code. Please try again.';
}
