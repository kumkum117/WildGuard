// Lightweight axios-free API wrapper for the WildGuard backend.
//
// By default requests go to same-origin `/api/...`: the Vite dev server proxies
// them to the Python backend (see vite.config.ts), and in production the
// backend serves this app itself. Set VITE_API_URL to call a backend on
// another host directly (the backend sends CORS headers).
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  /** True when the WildGuard backend itself answered (vs. unreachable / dev-proxy error page). */
  fromBackend: boolean;
  code?: string;
  data: Record<string, unknown>;
  constructor(message: string, status: number, fromBackend = false, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.fromBackend = fromBackend;
    this.code = typeof data.code === 'string' ? data.code : undefined;
    this.data = data;
  }
}

/** Absolute URL for an API path — use for fetch / downloads. */
export const apiUrl = (path: string) => (/^(https?:|data:)/.test(path) ? path : `${BASE}${path}`);

/**
 * URL for <img>/<video>/EventSource, which cannot send an Authorization header.
 * Same-origin requests carry the session cookie; a cross-origin backend
 * (VITE_API_URL) gets the token as a query parameter instead.
 */
export const mediaUrl = (path: string) => {
  const url = apiUrl(path);
  const token = localStorage.getItem('wg_token');
  if (!BASE || !token || /^data:/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};

let onUnauthorized: (() => void) | null = null;
/** Called when the backend reports the session is missing/expired. */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

const isBackend = (headers: { get(name: string): string | null }) => !!headers.get('X-WildGuard');

function handleUnauthorized(path: string, status: number, code?: string) {
  if (status === 401 && code === 'auth_required' && !path.startsWith('/api/auth/')) onUnauthorized?.();
}

async function errorFrom(res: Response, path: string): Promise<ApiError> {
  const fromBackend = isBackend(res.headers);
  let data: Record<string, unknown> = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch {
    /* non-JSON error body (e.g. dev proxy error page) */
  }
  const message =
    typeof data.error === 'string'
      ? data.error
      : fromBackend
      ? `Request failed (${res.status})`
      : 'The WildGuard backend is not reachable';
  handleUnauthorized(path, res.status, data.code as string | undefined);
  return new ApiError(message, res.status, fromBackend, data);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs, ...init } = options;
  const token = localStorage.getItem('wg_token');
  const controller = new AbortController();
  const timer = timeoutMs ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    throw new ApiError(
      (err as Error).name === 'AbortError' ? 'The WildGuard backend did not respond' : 'The WildGuard backend is not reachable',
      0
    );
  } finally {
    if (timer) window.clearTimeout(timer);
  }
  if (!res.ok) throw await errorFrom(res, path);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export function apiUpload<T>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open('POST', apiUrl(path));
    const token = localStorage.getItem('wg_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        const fromBackend = !!xhr.getResponseHeader('X-WildGuard');
        handleUnauthorized(path, xhr.status, data.code as string | undefined);
        const msg = typeof data.error === 'string' ? data.error : `Upload failed (${xhr.status})`;
        reject(new ApiError(msg, xhr.status, fromBackend, data));
      }
    };
    xhr.onerror = () => reject(new ApiError('Network error — is the WildGuard backend running?', 0));
    xhr.onabort = () => reject(new ApiError('Upload cancelled', 0));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export const isApiConfigured = () => Boolean(BASE);
