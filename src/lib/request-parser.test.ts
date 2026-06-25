// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn() },
}));

import { parseJsonBody } from "./request-parser";
import { z } from "zod";

beforeEach(() => warn.mockClear());

function makeRequest(body: unknown, valid = true): Request {
  if (!valid) {
    return new Request("http://localhost/test", {
      method: "POST",
      body: "not json{{{",
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Request("http://localhost/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseJsonBody", () => {
  it("returns data for valid JSON without schema", async () => {
    const result = await parseJsonBody(makeRequest({ name: "test" }));
    expect(result).toEqual({ data: { name: "test" } });
  });

  it("returns data for valid JSON matching schema", async () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = await parseJsonBody(makeRequest({ name: "Alice", age: 30 }), schema);
    expect(result).toEqual({ data: { name: "Alice", age: 30 } });
  });

  it("returns error for unparseable JSON", async () => {
    const result = await parseJsonBody(makeRequest(null, false));
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body).toEqual({ error: "Invalid JSON" });
    }
  });

  // BRDG-401: a bad body must leave a server-side trace, tagged with the route
  // PATH only (the query string can carry tokens, and the body failed to parse).
  it("logs a warn with the request path on an invalid JSON body", async () => {
    await parseJsonBody(makeRequest(null, false));
    expect(warn).toHaveBeenCalledTimes(1);
    const [tag, message] = warn.mock.calls[0];
    expect(tag).toBe("request-parser");
    expect(message).toContain("/test");
  });

  it("does not log the raw body or query string on the invalid-JSON path", async () => {
    const req = new Request("http://localhost/secret?token=abc123", {
      method: "POST",
      body: "not json {{{",
      headers: { "Content-Type": "application/json" },
    });
    await parseJsonBody(req);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("/secret");
    expect(logged).not.toContain("abc123"); // query string token must not leak
    expect(logged).not.toContain("not json"); // raw body must not leak
  });

  it("does not log when the JSON parses (only the bad-body path warns)", async () => {
    await parseJsonBody(makeRequest({ ok: true }));
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns error for JSON that fails schema validation", async () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = await parseJsonBody(makeRequest({ name: "" }), schema);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.error).toBeTruthy();
    }
  });

  it("returns error when required field is missing", async () => {
    const schema = z.object({ name: z.string() });
    const result = await parseJsonBody(makeRequest({}), schema);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  it("applies schema transforms", async () => {
    const schema = z.object({ name: z.string().trim() });
    const result = await parseJsonBody(makeRequest({ name: "  Alice  " }), schema);
    expect(result).toEqual({ data: { name: "Alice" } });
  });
});
