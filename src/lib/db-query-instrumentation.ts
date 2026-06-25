import type { Database, Statement } from "better-sqlite3";
import { normalizeSqlLabel, recordQuery } from "@/lib/query-timer";

// The better-sqlite3 statement methods that actually execute SQL (and therefore
// take measurable time). `values` is intentionally absent: this version exposes
// it via `.raw().all()`, not as its own method, so wrapping the four below
// captures every execution path Drizzle uses. The remaining statement methods
// (`pluck`/`raw`/`expand`/`bind`/`safeIntegers`/`columns`) are config/metadata,
// not execution, and are forwarded untouched.
const EXECUTION_METHODS = new Set(["run", "get", "all", "iterate"]);

// Chainable config methods return the statement itself (`this`). Their return
// value must be re-wrapped so a later `.all()`/`.get()` on the chain is still
// timed (e.g. `stmt.raw().all()`).
const CHAINABLE_METHODS = new Set([
  "pluck",
  "expand",
  "raw",
  "bind",
  "safeIntegers",
]);

/**
 * Wraps a better-sqlite3 statement in a Proxy that times its execution methods
 * and records them under the statement's SQL text (parameterized, value-free),
 * while forwarding the full statement API unchanged so Drizzle keeps working.
 *
 * WHY a Proxy and not a subclass: Drizzle relies on the real statement's
 * `.raw()`, `.pluck()`, `.expand()`, `.bind()`, `.columns()` and the
 * `.reader`/`.source`/`.busy` properties. Forwarding everything and only
 * intercepting the execution methods preserves that surface exactly; chainable
 * methods are re-wrapped so timing survives a `.raw().all()` chain.
 */
function wrapStatement<S extends Statement>(statement: S): S {
  // The SQL text is the parameterized source (`?` placeholders). It is computed
  // once per statement, never per execution, and never includes bound values.
  const label = normalizeSqlLabel(statement.source);

  return new Proxy(statement, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      const name = typeof prop === "string" ? prop : "";

      if (EXECUTION_METHODS.has(name)) {
        return function (this: unknown, ...args: unknown[]) {
          const start = performance.now();
          try {
            // `iterate` returns a lazy iterator; the time here covers preparing
            // it, which is the dominant cost in practice. Rows are pulled later
            // by the caller. Bind to the real statement, not the proxy.
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          } finally {
            recordQuery(label, Math.round(performance.now() - start));
          }
        };
      }

      if (CHAINABLE_METHODS.has(name)) {
        return function (this: unknown, ...args: unknown[]) {
          const result = (value as (...a: unknown[]) => unknown).apply(
            target,
            args,
          );
          // These return the same statement; re-wrap so the chain stays timed.
          // Anything else (defensive) is returned as-is.
          return result === target ? receiver : result;
        };
      }

      // All other methods (e.g. `columns`) forward to the real statement.
      return value.bind(target);
    },
  });
}

/**
 * Wraps a better-sqlite3 `Database` so every `prepare()` returns an instrumented
 * statement (see `wrapStatement`). Returns the same Database instance with a
 * patched `prepare`; all other Database methods are untouched. Idempotent: a
 * second call is a no-op so a re-imported module cannot double-wrap.
 */
const INSTRUMENTED = new WeakSet<Database>();

export function instrumentDatabase(database: Database): Database {
  if (INSTRUMENTED.has(database)) return database;
  // A handle without a real `prepare` (e.g. a test stub) has nothing to time;
  // return it untouched rather than throwing, so instrumentation never changes
  // the boot contract for a minimally-mocked Database.
  if (typeof database.prepare !== "function") return database;
  INSTRUMENTED.add(database);

  const originalPrepare = database.prepare.bind(database);
  // Cast through unknown: the patched function preserves the original's
  // overloaded signature, which TypeScript cannot express for a reassignment.
  database.prepare = function (this: unknown, source: string) {
    return wrapStatement(originalPrepare(source));
  } as unknown as typeof database.prepare;

  return database;
}
