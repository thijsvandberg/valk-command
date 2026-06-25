// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRequestLog } from "./request-log";
import { logger, _setLevel } from "./logger";

function makeRequest(
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://bridge.local${path}`, { method, headers });
}

function accessLines(): string[] {
  return (console.log as ReturnType<typeof vi.fn>).mock.calls
    .map((c) => String(c[0]))
    .filter((line) => line.includes("[access]"));
}

describe("withRequestLog", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    _setLevel("debug");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the handler's response unchanged", async () => {
    const body = { ok: true };
    const original = Response.json(body, { status: 201 });
    const wrapped = withRequestLog(async () => original);
    const res = await wrapped(makeRequest("/api/tickets", "POST"));
    expect(res).toBe(original);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(body);
  });

  it("emits one access line with method, path, status, ms, user and reqId", async () => {
    const wrapped = withRequestLog(async () => new Response(null, { status: 204 }));
    await wrapped(
      makeRequest("/api/tickets", "DELETE", {
        "x-request-id": "req-xyz",
        "x-bridge-user-id": "user_42",
      }),
    );
    const lines = accessLines();
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toContain("DELETE /api/tickets 204");
    expect(line).toMatch(/ \d+ms/);
    expect(line).toContain("user=user_42");
    expect(line).toContain("reqId=req-xyz");
  });

  it("activates the request context so handler logs carry the same reqId", async () => {
    const wrapped = withRequestLog(async () => {
      // A catch-block style error logged from inside the handler must correlate.
      logger.error("handler", "boom");
      return new Response(null, { status: 500 });
    });
    await wrapped(makeRequest("/api/tickets", "GET", { "x-request-id": "corr-1" }));

    const errLine = (console.error as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("[handler]"));
    expect(errLine).toMatch(/reqId=corr-1$/);

    // And the access line shares that id.
    expect(accessLines()[0]).toContain("reqId=corr-1");
  });

  it("still emits an access line and runs when no request id is present", async () => {
    const wrapped = withRequestLog(async () => new Response("hi", { status: 200 }));
    const res = await wrapped(makeRequest("/api/health", "GET"));
    expect(res.status).toBe(200);
    const line = accessLines()[0];
    expect(line).toContain("GET /api/health 200");
    expect(line).not.toContain("reqId=");
    expect(line).not.toContain("user=");
  });

  it("passes through extra route-context arguments (e.g. params)", async () => {
    const handler = vi.fn(
      async (_req: Request, ctx: { params: Promise<{ key: string }> }) => {
        const { key } = await ctx.params;
        return Response.json({ key });
      },
    );
    const wrapped = withRequestLog(handler);
    const res = await wrapped(makeRequest("/api/tickets/ABC", "GET"), {
      params: Promise.resolve({ key: "ABC" }),
    });
    expect(await res.json()).toEqual({ key: "ABC" });
    expect(handler).toHaveBeenCalledOnce();
  });
});
