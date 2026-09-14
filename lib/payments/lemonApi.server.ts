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

async function lemonMainApiRequest<T>(
  path: string,
  options: { method: 'GET' | 'PATCH'; body?: unknown }
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LEMON_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${LEMON_API_BASE_URL}${normalizeApiPath(path)}`, {
      method: options.method,
      headers: {
        Accept: 'application/vnd.api+json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/vnd.api+json' }),
        Authorization: `Bearer ${getLemonApiKey()}`
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
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

export async function lemonApiRequest<T>(path: string): Promise<T> {
  return lemonMainApiRequest<T>(path, { method: 'GET' });
}

export async function lemonApiPatch<T>(path: string, body: unknown): Promise<T> {
  return lemonMainApiRequest<T>(path, { method: 'PATCH', body });
}

export async function lemonLicenseApiRequest<T>(
  path: string,
  fields: Record<string, string>
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LEMON_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${LEMON_API_BASE_URL}${normalizeApiPath(path)}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(fields).toString(),
      cache: 'no-store',
      signal: controller.signal
    });

    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok) {
      // License API responses can contain customer and key metadata. Do not include
      // the response body in errors that may be logged by callers.
      throw new LemonApiError(
        `Lemon Squeezy license request failed with status ${response.status}.`,
        response.status,
        response.headers.get('retry-after')
      );
    }

    if (!payload) {
      throw new LemonApiError('Lemon Squeezy license API returned an empty response.', 502);
    }

    return payload;
  } catch (error) {
    if (error instanceof LemonApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new LemonApiError('Lemon Squeezy license request timed out.', 504);
    }

    throw new LemonApiError('Could not connect to Lemon Squeezy.', 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
