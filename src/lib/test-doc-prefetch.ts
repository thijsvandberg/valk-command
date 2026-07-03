import { tickets as ticketsApi } from "@/lib/api-client";

type TestDocResponse = Awaited<ReturnType<typeof ticketsApi.getTestDoc>>;

/**
 * Tiny client-side cache for GET test-doc (BRDG-426): hovering the marker or
 * the status line's View button prefetches, so the review modal opens with the
 * cached doc already in hand instead of spinning on a round trip (the dev
 * server makes every request feel expensive). Short TTL + explicit
 * invalidation on writes keep it honest.
 */
const cache = new Map<string, { at: number; data: TestDocResponse }>();
const inflight = new Map<string, Promise<void>>();
const TTL_MS = 20_000;

export function prefetchTestDoc(key: string): void {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  if (inflight.has(key)) return;
  const p = ticketsApi
    .getTestDoc(key)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
    })
    .catch(() => {})
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
}

export function getCachedTestDoc(key: string): TestDocResponse | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at >= TTL_MS) return null;
  return hit.data;
}

export function primeTestDocCache(key: string, data: TestDocResponse): void {
  cache.set(key, { at: Date.now(), data });
}

export function invalidateTestDocCache(key: string): void {
  cache.delete(key);
}
