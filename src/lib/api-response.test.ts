// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn() },
}));

import { errorResponse, validationError, successResponse, agentErrorResponse } from "./api-response";
import type { AgentError } from "@/lib/agent-fetch";
import { z, ZodError } from "zod";

beforeEach(() => warn.mockClear());

describe("errorResponse", () => {
  it("returns JSON with error message and status", async () => {
    const res = errorResponse("Not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("includes code when provided", async () => {
    const res = errorResponse("Duplicate", 409, "DUPLICATE");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: "Duplicate", code: "DUPLICATE" });
  });

  it("omits code when undefined", async () => {
    const res = errorResponse("Bad request", 400);
    const body = await res.json();
    expect(body).toEqual({ error: "Bad request" });
    expect("code" in body).toBe(false);
  });
});

describe("validationError", () => {
  it("returns 400 with string message", async () => {
    const res = validationError("Field required");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Field required" });
  });

  it("extracts first issue from ZodError", async () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const parsed = schema.safeParse({ name: 123, age: "wrong" });
    const zodError = (parsed as { success: false; error: ZodError }).error;
    const res = validationError(zodError);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns fallback message for empty ZodError", async () => {
    const zodError = new ZodError([]);
    const res = validationError(zodError);
    const body = await res.json();
    expect(body).toEqual({ error: "Invalid request body" });
  });

  // BRDG-401: a rejected body must leave a server-side trace, but the log must
  // carry only the issue field PATHS and COUNT, never the rejected VALUES (which
  // can be PII/secrets).
  it("logs a warn with the issue field paths and count on a zod failure", () => {
    const schema = z.object({ title: z.string(), points: z.number() });
    const parsed = schema.safeParse({ title: 123, points: "many" });
    validationError((parsed as { success: false; error: ZodError }).error);

    expect(warn).toHaveBeenCalledTimes(1);
    const [tag, message] = warn.mock.calls[0];
    expect(tag).toBe("validation");
    expect(message).toContain("2 issue(s)");
    expect(message).toContain("title");
    expect(message).toContain("points");
  });

  it("logs nested issue paths as dotted field names", () => {
    const schema = z.object({ items: z.array(z.object({ name: z.string() })) });
    const parsed = schema.safeParse({ items: [{ name: 5 }] });
    validationError((parsed as { success: false; error: ZodError }).error);

    const [, message] = warn.mock.calls[0];
    expect(message).toContain("items.0.name");
  });

  it("does NOT log the rejected values (no PII/secrets)", () => {
    // min(40) so the secret-looking value is rejected and the issue is produced.
    const schema = z.object({ password: z.string().min(40) });
    const secret = "hunter2-secret-token";
    const parsed = schema.safeParse({ password: secret });
    expect(parsed.success).toBe(false);
    validationError((parsed as { success: false; error: ZodError }).error);

    // Field name is fine to log; the value must never appear in any log argument.
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("password");
    expect(logged).not.toContain(secret);
  });

  it("does not log for a string (non-zod) validation message", () => {
    validationError("Field required");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("successResponse", () => {
  it("returns data with 200 by default", async () => {
    const res = successResponse({ id: "abc" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: "abc" });
  });

  it("accepts custom status", async () => {
    const res = successResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  it("accepts custom headers", async () => {
    const res = successResponse({ ok: true }, 200, { "X-Custom": "test" });
    expect(res.headers.get("X-Custom")).toBe("test");
  });
});

describe("agentErrorResponse", () => {
  it("maps AgentError to { error, code } response", async () => {
    const agentErr: AgentError = { error: "Cannot reach workspace", code: "UNREACHABLE" };
    const res = agentErrorResponse(agentErr, 502);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "Cannot reach workspace", code: "UNREACHABLE" });
  });

  it("defaults to 502 when status is 0", async () => {
    const agentErr: AgentError = { error: "Timeout", code: "TIMEOUT" };
    const res = agentErrorResponse(agentErr, 0);
    expect(res.status).toBe(502);
  });
});
