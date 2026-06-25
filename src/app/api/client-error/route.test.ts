// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture what the server logger receives. The route writes via logger.error;
// we assert the tag is "client" and the structured extra carries the fields.
const errorSpy = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args: unknown[]) => errorSpy(...args),
  },
}));

vi.mock("server-only", () => ({}));

import { POST } from "./route";
import { _resetClientErrorSinkThrottle, MAX_BODY_BYTES } from "@/lib/client-error-sink";

const URL = "http://localhost:3100/api/client-error";

function postJson(body: unknown, headers?: Record<string, string>): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(URL, {
    method: "POST",
    body: raw,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("POST /api/client-error", () => {
  beforeEach(() => {
    errorSpy.mockClear();
    _resetClientErrorSinkThrottle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a [client] line with message, stack, digest, pathname", async () => {
    const res = await POST(
      postJson({
        message: "Boom in board",
        stack: "Error: Boom\n  at Board",
        digest: "abc123",
        pathname: "/sprint",
        source: "window.onerror",
      }),
    );

    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [tag, message, extra] = errorSpy.mock.calls[0];
    expect(tag).toBe("client");
    expect(message).toBe("Boom in board");
    expect(extra).toMatchObject({
      stack: "Error: Boom\n  at Board",
      digest: "abc123",
      pathname: "/sprint",
      source: "window.onerror",
    });
  });

  it("includes the user id from the x-bridge-user-id header when present", async () => {
    await POST(postJson({ message: "with user" }, { "x-bridge-user-id": "user-42" }));

    const [, , extra] = errorSpy.mock.calls[0];
    expect(extra).toMatchObject({ userId: "user-42" });
  });

  it("omits userId when the header is absent", async () => {
    await POST(postJson({ message: "no user" }));
    const [, , extra] = errorSpy.mock.calls[0];
    expect(extra).not.toHaveProperty("userId");
  });

  it("rejects an empty message (validation)", async () => {
    const res = await POST(postJson({ message: "" }));
    expect(res.status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing message (validation)", async () => {
    const res = await POST(postJson({ stack: "x" }));
    expect(res.status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const res = await POST(postJson("not json"));
    expect(res.status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects a message over the cap (bounds the payload)", async () => {
    const res = await POST(postJson({ message: "x".repeat(MAX_BODY_BYTES + 1) }));
    // Over the body cap returns 413; if under the body cap but over the field
    // cap it would be 400. Either way it must not log.
    expect([400, 413]).toContain(res.status);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejects a body over the size cap with 413 (content-length)", async () => {
    const big = "x".repeat(MAX_BODY_BYTES + 100);
    const req = new Request(URL, {
      method: "POST",
      body: JSON.stringify({ message: big }),
      headers: {
        "Content-Type": "application/json",
        "content-length": String(MAX_BODY_BYTES + 200),
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("throttles/dedups an identical (message+pathname) within the window", async () => {
    const body = { message: "repeat me", pathname: "/sprint" };

    const first = await POST(postJson(body));
    const second = await POST(postJson(body));
    const third = await POST(postJson(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    // Only the first is logged; the rest are acked but suppressed.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect((await second.json()).throttled).toBe(true);
  });

  it("does not throttle a different pathname for the same message", async () => {
    await POST(postJson({ message: "same", pathname: "/a" }));
    await POST(postJson({ message: "same", pathname: "/b" }));
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("strips unknown fields so no client-supplied secret is logged", async () => {
    await POST(
      postJson({
        message: "with extras",
        token: "super-secret",
        cookie: "session=abc",
      } as unknown as Record<string, unknown>),
    );

    const [, , extra] = errorSpy.mock.calls[0];
    expect(extra).not.toHaveProperty("token");
    expect(extra).not.toHaveProperty("cookie");
  });

  it("accepts a sendBeacon-style body without a JSON content-type", async () => {
    // sendBeacon posts a Blob; the route reads request.text() and parses, so it
    // must not depend on the Content-Type header.
    const req = new Request(URL, {
      method: "POST",
      body: JSON.stringify({ message: "from beacon" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][1]).toBe("from beacon");
  });
});
