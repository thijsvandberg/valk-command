import { describe, it, expect } from "vitest";
import {
  ServiceError,
  NotFoundError,
  ValidationError,
  ConflictError,
  JiraUnavailableError,
  JiraOperationError,
} from "./errors";

describe("ServiceError", () => {
  it("sets code, message, statusCode, and name", () => {
    const err = new ServiceError("MY_CODE", "something went wrong", 418);
    expect(err.code).toBe("MY_CODE");
    expect(err.message).toBe("something went wrong");
    expect(err.statusCode).toBe(418);
    expect(err.name).toBe("ServiceError");
    expect(err).toBeInstanceOf(Error);
  });

  it("defaults statusCode to 500 when not provided", () => {
    const err = new ServiceError("X", "msg");
    expect(err.statusCode).toBe(500);
  });
});

describe("NotFoundError", () => {
  it("has correct code, statusCode, name, and message", () => {
    const err = new NotFoundError("Ticket", "VPL-1");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("NotFoundError");
    expect(err.message).toBe("Ticket not found: VPL-1");
    expect(err).toBeInstanceOf(ServiceError);
  });
});

describe("ValidationError", () => {
  it("has correct code, statusCode, name, and message", () => {
    const err = new ValidationError("field is required");
    expect(err.code).toBe("VALIDATION");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("ValidationError");
    expect(err.message).toBe("field is required");
    expect(err).toBeInstanceOf(ServiceError);
  });
});

describe("ConflictError", () => {
  it("has correct code, statusCode, name, message, and details", () => {
    const err = new ConflictError("content conflict", { contentChanged: true });
    expect(err.code).toBe("CONFLICT");
    expect(err.statusCode).toBe(409);
    expect(err.name).toBe("ConflictError");
    expect(err.message).toBe("content conflict");
    expect(err.details).toEqual({ contentChanged: true });
    expect(err).toBeInstanceOf(ServiceError);
  });

  it("preserves contentChanged: false", () => {
    const err = new ConflictError("metadata only", { contentChanged: false });
    expect(err.details.contentChanged).toBe(false);
  });
});

describe("JiraUnavailableError", () => {
  it("has correct code, statusCode, name, and message", () => {
    const err = new JiraUnavailableError();
    expect(err.code).toBe("JIRA_UNAVAILABLE");
    expect(err.statusCode).toBe(503);
    expect(err.name).toBe("JiraUnavailableError");
    expect(err.message).toBe("Jira is not configured");
    expect(err).toBeInstanceOf(ServiceError);
  });
});

describe("JiraOperationError", () => {
  it("has correct code, statusCode, name, message, and detail", () => {
    const err = new JiraOperationError("Failed to push", "403: Forbidden");
    expect(err.code).toBe("JIRA_ERROR");
    expect(err.statusCode).toBe(502);
    expect(err.name).toBe("JiraOperationError");
    expect(err.message).toBe("Failed to push");
    expect(err.detail).toBe("403: Forbidden");
    expect(err).toBeInstanceOf(ServiceError);
  });
});
