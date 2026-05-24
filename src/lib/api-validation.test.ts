// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Mock server-only and logger before importing
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { validatePathParam, escapeLikePattern, safeJsonParse } from "./api-validation";
import { logger } from "@/lib/logger";

describe("validatePathParam", () => {
  it("returns null for valid params", () => {
    expect(validatePathParam("PROJ-123")).toBeNull();
    expect(validatePathParam("abc")).toBeNull();
    expect(validatePathParam("a".repeat(255))).toBeNull();
  });

  it("rejects empty string", () => {
    const result = validatePathParam("");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it("rejects params exceeding maxLength", () => {
    const result = validatePathParam("a".repeat(256));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it("rejects params with null bytes", () => {
    const result = validatePathParam("abc\0def");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it("respects custom maxLength", () => {
    expect(validatePathParam("abcde", 5)).toBeNull();
    const result = validatePathParam("abcdef", 5);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
  });

  it("returns JSON error body", async () => {
    const result = validatePathParam("a".repeat(300));
    const body = await result!.json();
    expect(body.error).toBe("Invalid parameter");
  });
});

describe("escapeLikePattern", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeLikePattern("PROJ-123")).toBe("PROJ-123");
    expect(escapeLikePattern("hello world")).toBe("hello world");
  });

  it("escapes percent signs", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("%admin%")).toBe("\\%admin\\%");
  });

  it("escapes underscores", () => {
    expect(escapeLikePattern("user_name")).toBe("user\\_name");
  });

  it("escapes both wildcards", () => {
    expect(escapeLikePattern("%_mixed_%")).toBe("\\%\\_mixed\\_\\%");
  });

  it("handles empty string", () => {
    expect(escapeLikePattern("")).toBe("");
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    expect(safeJsonParse("[1,2,3]", [])).toEqual([1, 2, 3]);
    expect(safeJsonParse('"hello"', "")).toBe("hello");
  });

  it("returns fallback for null/undefined", () => {
    expect(safeJsonParse(null, [])).toEqual([]);
    expect(safeJsonParse(undefined, "default")).toBe("default");
  });

  it("returns fallback for malformed JSON and logs warning", () => {
    const result = safeJsonParse("{broken", { fallback: true }, "test-tag");
    expect(result).toEqual({ fallback: true });
    expect(logger.warn).toHaveBeenCalledWith(
      "test-tag",
      "Malformed JSON in stored data",
      "{broken",
    );
  });

  it("truncates long malformed JSON in log", () => {
    const longString = "x".repeat(300);
    safeJsonParse(longString, null, "test");
    expect(logger.warn).toHaveBeenCalledWith(
      "test",
      "Malformed JSON in stored data",
      longString.slice(0, 200),
    );
  });
});
