import { describe, it, expect } from "vitest";
import { friendlyAgentError } from "./agent-errors";

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
