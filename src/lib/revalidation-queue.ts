/**
 * View-driven revalidation queue.
 *
 * Tickets are enqueued when they are displayed to the user (list or detail view).
 * A scheduled task periodically dequeues the oldest entries and checks them
 * against Jira to detect deletions. A 24-hour cooldown prevents redundant checks.
 */

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// key -> timestamp when enqueued
const queue = new Map<string, number>();

// key -> timestamp when last successfully checked
const lastChecked = new Map<string, number>();

/**
 * Add ticket keys to the revalidation queue.
 * Skips keys that were already checked within the cooldown window,
 * and keys that are already queued.
 */
export function enqueue(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    if (queue.has(key)) continue;
    const checked = lastChecked.get(key);
    if (checked && now - checked < COOLDOWN_MS) continue;
    queue.set(key, now);
  }
}

/**
 * Remove and return the oldest N entries from the queue.
 */
export function dequeue(limit: number): string[] {
  const entries = Array.from(queue.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit);

  const keys: string[] = [];
  for (const [key] of entries) {
    keys.push(key);
    queue.delete(key);
  }
  return keys;
}

/**
 * Drop `lastChecked` entries whose cooldown has fully elapsed. Such an entry no
 * longer changes `enqueue`'s decision (the key is re-checkable once
 * `now - checked >= COOLDOWN_MS`), so pruning it is behaviour-preserving and keeps
 * the Map from accumulating one permanent entry per ticket ever viewed.
 *
 * Iterates a SNAPSHOT array, never the live Map's iterator: deleting while iterating
 * a Map's own iterator is what caused the BRDG-387 LRU-provider freeze. The snapshot
 * decouples iteration from mutation.
 */
function pruneExpired(now: number): void {
  for (const [key, checked] of [...lastChecked]) {
    if (now - checked >= COOLDOWN_MS) lastChecked.delete(key);
  }
}

/**
 * Mark keys as successfully checked (resets their cooldown).
 */
export function markChecked(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    lastChecked.set(key, now);
  }
  pruneExpired(now);
}

/**
 * Remove keys from both queue and cooldown (e.g. when marked as deleted).
 */
export function remove(keys: string[]): void {
  for (const key of keys) {
    queue.delete(key);
    lastChecked.delete(key);
  }
}

/**
 * Current queue statistics for monitoring in the settings UI.
 */
export function stats(): { queueSize: number; cooldownSize: number } {
  return {
    queueSize: queue.size,
    cooldownSize: lastChecked.size,
  };
}

/**
 * Reset all state. Only used in tests.
 */
export function _reset(): void {
  queue.clear();
  lastChecked.clear();
}
