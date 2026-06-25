// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "@/lib/logger";
import { handleServiceError } from "./handle-service-error";
import { ServiceError, ValidationError, NotFoundError, JiraOperationError } from "./errors";

describe("handleServiceError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs an unknown error at error level with the original error", async () => {
    const err = new Error("db is locked");
    const res = handleServiceError(err);

    expect(logger.error).toHaveBeenCalledWith("service", "unhandled error", err);
    expect(logger.warn).not.toHaveBeenCalled();
    // Response shape is unchanged from before logging was added.
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("logs a ServiceError at warn with code and statusCode, not error", async () => {
    const err = new ValidationError("missing field");
    const res = handleServiceError(err);

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const call = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("service");
    expect(call[1]).toContain("VALIDATION");
    expect(call[2]).toEqual({ statusCode: 400 });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing field", code: "VALIDATION" });
  });

  it("preserves the NotFoundError response shape and status", async () => {
    const res = handleServiceError(new NotFoundError("Ticket", "ABC-1"));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Ticket not found: ABC-1", code: "NOT_FOUND" });
  });

  it("still includes detail for JiraOperationError and logs at warn", async () => {
    const res = handleServiceError(new JiraOperationError("Jira write failed", "transition not allowed"));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Jira write failed",
      code: "JIRA_ERROR",
      detail: "transition not allowed",
    });
  });

  it("treats a base ServiceError (default 500) as warn, not a fatal error", async () => {
    const res = handleServiceError(new ServiceError("CUSTOM", "something went wrong"));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][2]).toEqual({ statusCode: 500 });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "something went wrong", code: "CUSTOM" });
  });
});
