import 'server-only';

const LEMON_API_BASE_URL = 'https://api.lemonsqueezy.com/v1';
const LEMON_API_TIMEOUT_MS = 12_000;

export class LemonApiError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(message: string, status: number, retryAfter: string | null = null) {
    super(message);
    this.name = 'LemonApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function getLemonApiKey() {
  const apiKey = process.env.LEMON_API_KEY?.trim();
  if (!apiKey) {
    throw new LemonApiError('Lemon Squeezy API is not configured.', 500);
  }

  return apiKey;
}

function normalizeApiPath(path: string) {
  if (!path.startsWith('/')) {
    throw new LemonApiError('Invalid Lemon Squeezy API path.', 500);
  }

  return path;
}

export async function lemonApiRequest<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LEMON_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${LEMON_API_BASE_URL}${normalizeApiPath(path)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${getLemonApiKey()}`
      },
      cache: 'no-store',
      signal: controller.signal
    });

    const payload = (await response.json().catch(() => null)) as
      | T
      | { errors?: Array<{ detail?: string; title?: string }> }
      | null;

    if (!response.ok) {
      const firstError =
        payload && typeof payload === 'object' && 'errors' in payload ? payload.errors?.[0] : null;
      const detail = firstError?.detail ?? firstError?.title;
      throw new LemonApiError(
        detail || `Lemon Squeezy API request failed with status ${response.status}.`,
        response.status,
        response.headers.get('retry-after')
      );
    }

    if (!payload) {
      throw new LemonApiError('Lemon Squeezy API returned an empty response.', 502);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof LemonApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new LemonApiError('Lemon Squeezy API request timed out.', 504);
    }

    throw new LemonApiError('Could not connect to Lemon Squeezy.', 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
