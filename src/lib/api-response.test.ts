// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { errorResponse, validationError, successResponse, agentErrorResponse } from "./api-response";
import type { AgentError } from "@/lib/agent-fetch";
import { z, ZodError } from "zod";

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
