// @vitest-environment node
import { describe, it, expect } from "vitest";
import { userInitials, userColor } from "./user-utils";

describe("userInitials", () => {
  it("extracts initials from full name", () => {
    expect(userInitials("John Doe")).toBe("JD");
  });

  it("handles single name", () => {
    expect(userInitials("Alice")).toBe("A");
  });

  it("takes first two words only", () => {
    expect(userInitials("John Michael Doe")).toBe("JM");
  });

  it("handles empty string", () => {
    expect(userInitials("")).toBe("");
  });

  it("handles extra whitespace", () => {
    expect(userInitials("  Jane   Smith  ")).toBe("JS");
  });
});

describe("userColor", () => {
  it("returns an hsl color string", () => {
    const color = userColor("Test User");
    expect(color).toMatch(/^hsl\(\d+, 55%, 50%\)$/);
  });

  it("returns deterministic results", () => {
    expect(userColor("Alice")).toBe(userColor("Alice"));
  });

  it("returns different colors for different names", () => {
    expect(userColor("Alice")).not.toBe(userColor("Bob"));
  });
});
