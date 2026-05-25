// @vitest-environment node
import { describe, it, expect } from "vitest";
import { friendlyAgentError, friendlyStreamError, isRetryableStreamError } from "./agent-errors";

describe("friendlyAgentError", () => {
  it("returns friendly message for known error codes", () => {
    expect(friendlyAgentError({ code: "TIMEOUT" })).toBe(
      "The workspace took too long to respond",
    );
    expect(friendlyAgentError({ code: "UNREACHABLE" })).toBe(
      "Cannot reach the workspace. Is it running?",
    );
    expect(friendlyAgentError({ code: "AUTH" })).toBe(
      "Authentication with the workspace failed",
    );
    expect(friendlyAgentError({ code: "SERVER_ERROR" })).toBe(
      "The workspace encountered an error",
    );
    expect(friendlyAgentError({ code: "INVALID_RESPONSE" })).toBe(
      "Received an unexpected response from the workspace",
    );
  });

  it("falls back to error string when code is unknown", () => {
    expect(friendlyAgentError({ error: "Custom error msg" })).toBe(
      "Custom error msg",
    );
  });

  it("prefers code-based message over raw error", () => {
    expect(
      friendlyAgentError({ code: "TIMEOUT", error: "some raw error" }),
    ).toBe("The workspace took too long to respond");
  });

  it("returns default fallback for null/undefined body", () => {
    expect(friendlyAgentError(null)).toBe("Something went wrong");
    expect(friendlyAgentError(undefined)).toBe("Something went wrong");
  });

  it("uses custom fallback when provided", () => {
    expect(friendlyAgentError(null, "Custom fallback")).toBe("Custom fallback");
  });

  it("returns fallback for empty object", () => {
    expect(friendlyAgentError({})).toBe("Something went wrong");
  });
});

describe("isRetryableStreamError", () => {
  it("returns true for Usage Policy errors", () => {
    expect(isRetryableStreamError("appears to violate our Usage Policy")).toBe(true);
    expect(isRetryableStreamError("API Error: violates content policy")).toBe(true);
    expect(isRetryableStreamError("this request appears to violate our Usage Policy")).toBe(true);
  });

  it("returns false for non-retryable errors", () => {
    expect(isRetryableStreamError("Unknown skill: suggest-subtasks")).toBe(false);
    expect(isRetryableStreamError("Connection to workspace lost")).toBe(false);
    expect(isRetryableStreamError("The workspace took too long")).toBe(false);
  });
});

describe("friendlyStreamError", () => {
  it("maps Usage Policy errors to friendly message", () => {
    const raw = "Claude Code is unable to respond to this request, which appears to violate our Usage Policy";
    expect(friendlyStreamError(raw)).toBe(
      "Could not generate suggestions. Try again or add subtasks manually.",
    );
  });

  it("maps content policy errors to friendly message", () => {
    expect(friendlyStreamError("content policy violation detected")).toBe(
      "Could not generate suggestions. Try again or add subtasks manually.",
    );
  });

  it("passes through unrecognized errors unchanged", () => {
    expect(friendlyStreamError("Unknown skill: foo")).toBe("Unknown skill: foo");
    expect(friendlyStreamError("Connection to workspace lost")).toBe("Connection to workspace lost");
  });
});
