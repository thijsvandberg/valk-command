/**
 * In-memory abort registry for running sync operations.
 *
 * Each sync endpoint registers an AbortController keyed by its sync log ID.
 * The cancel endpoint looks up the controller and calls .abort().
 * Only works for single-instance deployments (which this app is).
 */

const registry = new Map<string, AbortController>();

export function registerSync(syncId: string): AbortController {
  const controller = new AbortController();
  registry.set(syncId, controller);
  return controller;
}

export function abortSync(syncId: string): boolean {
  const controller = registry.get(syncId);
  if (!controller) return false;
  controller.abort();
  registry.delete(syncId);
  return true;
}

export function unregisterSync(syncId: string): void {
  registry.delete(syncId);
}

export function getActiveCount(): number {
  return registry.size;
}

export function abortAll(): string[] {
  const ids = [...registry.keys()];
  for (const [id, controller] of registry) {
    controller.abort();
    registry.delete(id);
  }
  return ids;
}
