/**
 * In-memory TTL cache with in-flight de-duplication. If a refresh fails and an
 * older value exists, the stale value is returned instead of throwing.
 */
export function ttlCache<T>(ttlMs: number, load: () => Promise<T>) {
  let value: { data: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    async get(): Promise<T> {
      if (value && value.expiresAt > Date.now()) return value.data;
      if (!inFlight) {
        inFlight = load()
          .then(data => {
            value = { data, expiresAt: Date.now() + ttlMs };
            return data;
          })
          .finally(() => {
            inFlight = null;
          });
      }
      try {
        return await inFlight;
      } catch (err) {
        if (value) {
          console.warn('[cache] refresh failed, serving stale value:', err);
          return value.data;
        }
        throw err;
      }
    },
  };
}
