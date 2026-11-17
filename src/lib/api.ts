import { handleStaticHostApi } from './staticHostStore.ts';

const TOKEN_STORAGE_KEY = 'kc_session_token';

export function setClientSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage restrictions
  }
}

export function getClientSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  const token = getClientSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const isJsonResponse = contentType.toLowerCase().includes('application/json');
  const isStaticHostFallback = url.startsWith('/api/') && !isJsonResponse;

  if (isStaticHostFallback) {
    return handleStaticHostApi<T>(url, init);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // ignore non-json error bodies
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}
