// @ts-nocheck
// Lightweight axios-free API wrapper. Swap baseURL when real backend is ready.
const BASE = (import.meta.env.VITE_API_URL as string) || '';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('wg_token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export const isApiConfigured = () => Boolean(BASE);
