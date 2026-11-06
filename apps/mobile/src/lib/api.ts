import * as SecureStore from 'expo-secure-store';

// The SafeNest API runs on the Netlify site (same address as the web dashboard).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
if (!API_URL) throw new Error('Set EXPO_PUBLIC_API_URL in apps/mobile/.env (your Netlify site address)');

const TOKEN_KEY = 'safenest.session';
let token: string | null = null;
let onSignedOut: (() => void) | null = null;

/** Current session token, for authenticated image requests. */
export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}
export async function saveToken(t: string) {
  token = t;
  await SecureStore.setItemAsync(TOKEN_KEY, t);
}
export async function clearToken() {
  token = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
/** Called when the server says the session is no longer valid. */
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn; };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET'),
      headers,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your internet and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/api/auth')) {
    await clearToken();
    onSignedOut?.();
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong. Please try again.');
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.';
}

export const WEB_URL = API_URL;
