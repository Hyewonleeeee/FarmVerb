export function normalizeMagicLinkEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getMagicLinkRedirectUrl() {
  if (typeof window === 'undefined') {
    return '/mypage';
  }

  return new URL('/mypage', window.location.origin).toString();
}

export function getMagicLinkErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (message.includes('Missing Supabase environment variables')) {
    return 'Magic Link is not configured correctly. Please check the Supabase environment variables.';
  }

  if (message.includes('Invalid NEXT_PUBLIC_SUPABASE_URL')) {
    return 'Magic Link is not configured correctly. Please check the Supabase project URL.';
  }

  if (/rate limit/i.test(message)) {
    return 'Too many email requests. Please wait a moment and try again.';
  }

  if (/redirect|not allowed|url/i.test(message)) {
    return 'The Magic Link redirect URL is not allowed. Please check the Supabase Auth redirect settings.';
  }

  if (/failed to fetch|fetch failed|networkerror|load failed|supabase unavailable/i.test(message)) {
    return 'Could not reach Supabase Auth. Please check your connection and try again.';
  }

  return message || 'Could not send the Magic Link. Please try again.';
}
