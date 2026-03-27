import type { ConfigPayload } from '../types/config';

export async function fetchConfig(): Promise<ConfigPayload> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/config`);
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
  return res.json() as Promise<ConfigPayload>;
}

export async function applyConfigPatch(raw: string): Promise<ConfigPayload> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Config patch failed: ${res.status}`);
  return res.json() as Promise<ConfigPayload>;
}
