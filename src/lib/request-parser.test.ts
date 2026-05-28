// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseJsonBody } from "./request-parser";
import { z } from "zod";

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
