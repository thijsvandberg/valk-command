import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("passes through a same-origin deep-link path", () => {
    expect(safeRedirectPath("/tickets/VPL-47093")).toBe("/tickets/VPL-47093");
  });

  it("keeps the query string and hash of a local path", () => {
    expect(safeRedirectPath("/tickets/VPL-1?tab=links")).toBe("/tickets/VPL-1?tab=links");
    expect(safeRedirectPath("/sprint-board#row-3")).toBe("/sprint-board#row-3");
  });

  it("falls back to home for empty/missing input", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects protocol-relative external targets", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
  });

  it("rejects absolute URLs to another origin", () => {
    expect(safeRedirectPath("https://evil.com/x")).toBe("/");
    expect(safeRedirectPath("http://localhost:3101/tickets/VPL-1")).toBe("/");
  });

  it("rejects paths with control characters or whitespace", () => {
    expect(safeRedirectPath("/tickets/\nVPL-1")).toBe("/");
    expect(safeRedirectPath("/a b")).toBe("/");
  });
});
