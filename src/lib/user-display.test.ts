// @vitest-environment node
import { describe, it, expect } from "vitest";
import { userInitials, userColor } from "./user-display";

describe("userInitials", () => {
  it("extracts initials from two-word name", () => {
    expect(userInitials("John Doe")).toBe("JD");
  });

  it("extracts single initial from one-word name", () => {
    expect(userInitials("Admin")).toBe("A");
  });

  it("limits to two initials for three-word names", () => {
    expect(userInitials("Jean Claude Van")).toBe("JC");
  });

  it("handles extra whitespace", () => {
    expect(userInitials("  John   Doe  ")).toBe("JD");
  });

  it("uppercases lowercase names", () => {
    expect(userInitials("john doe")).toBe("JD");
  });
});

describe("userColor", () => {
  it("returns an hsl color string", () => {
    const color = userColor("John Doe");
    expect(color).toMatch(/^hsl\(\d+, 55%, 50%\)$/);
  });

  it("returns consistent color for same name", () => {
    expect(userColor("Alice")).toBe(userColor("Alice"));
  });

  it("returns different colors for different names", () => {
    expect(userColor("Alice")).not.toBe(userColor("Bob"));
  });
});
