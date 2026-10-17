/*
  Minimal client for Supabase's Data API (PostgREST), used by the history
  collector. Server-only: SUPABASE_SECRET_KEY bypasses Row Level Security, so
  it must never reach the browser. It goes on the `apikey` header (Supabase's
  secret keys aren't JWTs) and must never be logged.
*/

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set on the server.');
  return { base: `${url.replace(/\/+$/, '')}/rest/v1`, key };
}

async function request<T>(path: string, init: { method: 'GET' | 'POST'; body?: string }): Promise<T> {
  const { base, key } = config();
  const res = await fetch(`${base}${path}`, {
    method: init.method,
    body: init.body,
    headers: { apikey: key, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Call a Postgres function defined in db/history.sql. */
export function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return request<T>(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
}

/** Read rows with a PostgREST query string, e.g. `select=last_seen&limit=1`. */
export function select<T>(table: string, query: string): Promise<T[]> {
  return request<T[]>(`/${table}?${query}`, { method: 'GET' });
}
