import { mutate as defaultMutate, type ScopedMutator } from "swr";

// The app wraps SWR in a custom cache provider (SWRProvider's lruProvider,
// BRDG-387). The `mutate` exported by "swr" is bound to SWR's DEFAULT cache, so
// against every hook in the provider tree it is a silent no-op: no revalidation,
// no cache patch, no error (BRDG-455/458). Non-hook modules (ticket-cache,
// sprint-board-utils, prefetch, row-actions adapter) cannot call useSWRConfig()
// themselves, so SWRProvider registers its provider-bound mutator here once on
// mount and those modules mutate through it.
//
// The fallback to the default-cache mutate exists only so calls made before the
// provider mounts (or in tests that never register) behave exactly like the old
// code instead of throwing; the dev-time warning makes that misuse visible.

let boundMutate: ScopedMutator | null = null;

export function registerScopedMutate(mutate: ScopedMutator): void {
  boundMutate = mutate;
}

// ScopedMutator is an overloaded generic interface, so a plain delegating arrow
// cannot satisfy it structurally; the cast is safe because every call is
// forwarded verbatim to a real ScopedMutator.
export const scopedMutate: ScopedMutator = ((...args: Parameters<ScopedMutator>) => {
  if (!boundMutate) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "scopedMutate called before SWRProvider registered its mutator; falling back to the default-cache mutate (likely a no-op).",
      );
    }
    return defaultMutate(...args);
  }
  return boundMutate(...args);
}) as ScopedMutator;

// Test-only: restore the unregistered state between cases.
export function __resetScopedMutateForTests(): void {
  boundMutate = null;
}
