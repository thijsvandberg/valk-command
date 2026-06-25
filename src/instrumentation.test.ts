// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The logger is mocked so we assert on level + payload, not console output.
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// register() eager-inits the DB and logs config status; both are mocked here so
// the crash-handler tests neither open a real SQLite file nor read real env.
vi.mock("@/db", () => ({ initDb: vi.fn() }));
vi.mock("@/lib/env", () => ({ logConfigStatus: vi.fn() }));

import { logger } from "@/lib/logger";
import { initDb } from "@/db";
import { logConfigStatus } from "@/lib/env";

type ProcessHandler = (arg: unknown) => void;

// Fresh module instance per test so the module-level double-registration guard
// resets, and a clean NEXT_RUNTIME for the runtime guard.
async function loadInstrumentation(runtime: string | undefined = "nodejs") {
  vi.resetModules();
  if (runtime === undefined) {
    delete process.env.NEXT_RUNTIME;
  } else {
    process.env.NEXT_RUNTIME = runtime;
  }
  return import("./instrumentation");
}

describe("instrumentation onRequestError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(overrides: Partial<{ method: string; path: string; headers: Record<string, string | string[]> }> = {}) {
    return {
      method: overrides.method ?? "GET",
      path: overrides.path ?? "/api/tickets",
      headers: overrides.headers ?? {},
    };
  }

  const context = {
    routerKind: "App Router" as const,
    routePath: "/api/tickets",
    routeType: "route" as const,
    revalidateReason: undefined,
  };

  it("logs method + path at error level", async () => {
    const { onRequestError } = await loadInstrumentation();
    onRequestError(new Error("boom"), makeRequest({ method: "POST", path: "/api/tickets/ABC-1" }), context);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("request-error");
    expect(call[1]).toBe("POST /api/tickets/ABC-1");
    expect(call[2]).toBeInstanceOf(Error);
  });

  it("includes the error digest when present", async () => {
    const { onRequestError } = await loadInstrumentation();
    const err = Object.assign(new Error("boom"), { digest: "digest-123" });
    onRequestError(err, makeRequest(), context);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    const meta = call[3] as Record<string, unknown>;
    expect(meta.digest).toBe("digest-123");
  });

  it("includes the user id from the x-bridge-user-id header", async () => {
    const { onRequestError } = await loadInstrumentation();
    onRequestError(new Error("boom"), makeRequest({ headers: { "x-bridge-user-id": "user-42" } }), context);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    const meta = call[3] as Record<string, unknown>;
    expect(meta.userId).toBe("user-42");
  });

  it("handles an array-valued user-id header by taking the first value", async () => {
    const { onRequestError } = await loadInstrumentation();
    onRequestError(new Error("boom"), makeRequest({ headers: { "x-bridge-user-id": ["user-7", "user-8"] } }), context);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    const meta = call[3] as Record<string, unknown>;
    expect(meta.userId).toBe("user-7");
  });

  it("includes the request id from the x-request-id header", async () => {
    const { onRequestError } = await loadInstrumentation();
    onRequestError(new Error("boom"), makeRequest({ headers: { "x-request-id": "req-abc" } }), context);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    const meta = call[3] as Record<string, unknown>;
    expect(meta.reqId).toBe("req-abc");
  });

  it("handles an array-valued x-request-id header by taking the first value", async () => {
    const { onRequestError } = await loadInstrumentation();
    onRequestError(new Error("boom"), makeRequest({ headers: { "x-request-id": ["req-1", "req-2"] } }), context);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    const meta = call[3] as Record<string, unknown>;
    expect(meta.reqId).toBe("req-1");
  });

  it("correlates user id and request id together in the context", async () => {
    const { onRequestError } = await loadInstrumentation();
    onRequestError(
      new Error("boom"),
      makeRequest({ headers: { "x-bridge-user-id": "user-9", "x-request-id": "req-9" } }),
      context,
    );

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    const meta = call[3] as Record<string, unknown>;
    expect(meta).toMatchObject({ userId: "user-9", reqId: "req-9" });
  });

  it("omits the context object when neither digest, user id nor request id are present", async () => {
    const { onRequestError } = await loadInstrumentation();
    onRequestError(new Error("boom"), makeRequest(), context);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call.length).toBe(3);
  });

  it("never throws even if the request is malformed", async () => {
    const { onRequestError } = await loadInstrumentation();
    expect(() =>
      // Deliberately pass a broken request shape to exercise the defensive guard.
      onRequestError(new Error("boom"), undefined as unknown as Parameters<typeof onRequestError>[1], context),
    ).not.toThrow();
  });
});

describe("instrumentation register / crash handlers", () => {
  let onSpy: ReturnType<typeof vi.spyOn>;
  const handlers = new Map<string, ProcessHandler>();

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    onSpy = vi.spyOn(process, "on").mockImplementation(((event: string, handler: ProcessHandler) => {
      handlers.set(event, handler);
      return process;
    }) as unknown as typeof process.on);
  });

  afterEach(() => {
    onSpy.mockRestore();
  });

  it("does nothing outside the Node.js runtime", async () => {
    const { register } = await loadInstrumentation("edge");
    await register();
    expect(process.on).not.toHaveBeenCalled();
  });

  it("does not eager-init the DB or log config status outside the Node runtime", async () => {
    const { register } = await loadInstrumentation("edge");
    await register();
    expect(initDb).not.toHaveBeenCalled();
    expect(logConfigStatus).not.toHaveBeenCalled();
  });

  it("eager-inits the DB and logs config status in the Node runtime", async () => {
    const { register } = await loadInstrumentation("nodejs");
    await register();
    expect(initDb).toHaveBeenCalledTimes(1);
    expect(logConfigStatus).toHaveBeenCalledTimes(1);
  });

  it("installs the crash handlers before eager-initializing the DB", async () => {
    // Ordering matters: if DB init runs first and throws, the crash net would
    // never be installed. Assert process.on fired before initDb was called.
    let onCallCountAtInit = -1;
    (initDb as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      onCallCountAtInit = onSpy.mock.calls.length;
    });
    const { register } = await loadInstrumentation("nodejs");
    await register();
    expect(onCallCountAtInit).toBe(2); // uncaughtException + unhandledRejection
  });

  it("still installs handlers and logs config status when eager DB-init throws", async () => {
    // A boot DB failure must be swallowed here (getDb already logged it) so the
    // crash net and the config summary are not skipped.
    (initDb as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("db open failed");
    });
    const { register } = await loadInstrumentation("nodejs");
    await expect(register()).resolves.toBeUndefined();
    expect(handlers.has("uncaughtException")).toBe(true);
    expect(handlers.has("unhandledRejection")).toBe(true);
    expect(logConfigStatus).toHaveBeenCalledTimes(1);
  });

  it("installs uncaughtException and unhandledRejection handlers in the Node runtime", async () => {
    const { register } = await loadInstrumentation("nodejs");
    await register();
    expect(handlers.has("uncaughtException")).toBe(true);
    expect(handlers.has("unhandledRejection")).toBe(true);
  });

  it("does not register the handlers twice when register runs again", async () => {
    const { register } = await loadInstrumentation("nodejs");
    await register();
    await register();
    const uncaughtRegistrations = onSpy.mock.calls.filter((c: unknown[]) => c[0] === "uncaughtException");
    expect(uncaughtRegistrations.length).toBe(1);
  });

  it("logs an unexpected uncaughtException at error with the full error", async () => {
    const { register } = await loadInstrumentation("nodejs");
    await register();
    const err = new Error("kaboom");
    handlers.get("uncaughtException")!(err);

    expect(logger.error).toHaveBeenCalledWith("uncaught-exception", "unhandled exception", err);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("filters an ECONNRESET uncaughtException to warn with no stacktrace", async () => {
    const { register } = await loadInstrumentation("nodejs");
    await register();
    const err = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
    handlers.get("uncaughtException")!(err);

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const call = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("uncaught-exception");
    // Only a short string is passed; the error object itself is not forwarded.
    expect(call.length).toBe(2);
    expect(call[1]).toContain("ECONNRESET");
  });

  it("filters an 'aborted'-message rejection to warn", async () => {
    const { register } = await loadInstrumentation("nodejs");
    await register();
    handlers.get("unhandledRejection")!(new Error("failed to pipe response"));

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("unhandled-rejection");
  });

  it("logs an unexpected unhandledRejection at error", async () => {
    const { register } = await loadInstrumentation("nodejs");
    await register();
    const reason = new Error("nope");
    handlers.get("unhandledRejection")!(reason);

    expect(logger.error).toHaveBeenCalledWith("unhandled-rejection", "unhandled promise rejection", reason);
  });
});
