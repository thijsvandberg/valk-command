import { describe, it, expect } from "vitest";
import { computeContentHash, ticketNeedsTitle, buildFollowUpContent } from "./story-writer-messages";

describe("computeContentHash", () => {
  it("produces consistent hash for same input", () => {
    const hash1 = computeContentHash("conv-1", "hello world");
    const hash2 = computeContentHash("conv-1", "hello world");
    expect(hash1).toBe(hash2);
  });

  it("normalizes whitespace before hashing", () => {
    const hash1 = computeContentHash("conv-1", "hello  world");
    const hash2 = computeContentHash("conv-1", "hello world");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different conversations", () => {
    const hash1 = computeContentHash("conv-1", "hello");
    const hash2 = computeContentHash("conv-2", "hello");
    expect(hash1).not.toBe(hash2);
  });

  it("produces different hashes for different content", () => {
    const hash1 = computeContentHash("conv-1", "hello");
    const hash2 = computeContentHash("conv-1", "world");
    expect(hash1).not.toBe(hash2);
  });
});

describe("ticketNeedsTitle", () => {
  it("returns true for null", () => {
    expect(ticketNeedsTitle(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(ticketNeedsTitle(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(ticketNeedsTitle("")).toBe(true);
  });

  it("returns true for whitespace-only", () => {
    expect(ticketNeedsTitle("   ")).toBe(true);
  });

  it("returns true for 'Untitled draft'", () => {
    expect(ticketNeedsTitle("Untitled draft")).toBe(true);
  });

  it("returns false for real title", () => {
    expect(ticketNeedsTitle("Implement login page")).toBe(false);
  });
});

describe("buildFollowUpContent", () => {
  const baseSession = { localDraft: null, localTitle: null, targetTicketKey: null };

  it("includes codebase research flag", () => {
    const result = buildFollowUpContent(baseSession, "VPL-1", "update the AC", true);
    expect(result.content).toContain("[codebase-research: on]");
  });

  it("includes draft context when edit intent detected", () => {
    const session = { ...baseSession, localDraft: "# Story\nSome content" };
    const result = buildFollowUpContent(session, "VPL-1", "rewrite the acceptance criteria", false);
    if (result.isEdit) {
      expect(result.content).toContain("[Current story draft]");
      expect(result.content).toContain("# Story\nSome content");
    }
  });

  it("includes split mode reminder when target ticket set", () => {
    const session = { ...baseSession, targetTicketKey: "VPL-2" };
    const result = buildFollowUpContent(session, "VPL-1", "move the AC to target", false);
    expect(result.content).toContain("[Split mode: original=VPL-1, target=VPL-2");
  });

  it("includes title reminder when title is missing", () => {
    const result = buildFollowUpContent(baseSession, "VPL-1", "just a question", false);
    expect(result.content).toContain("title-suggestions");
  });

  it("omits title reminder when title exists", () => {
    const session = { ...baseSession, localTitle: "My Story" };
    const result = buildFollowUpContent(session, "VPL-1", "just a question", false);
    expect(result.content).not.toContain("title-suggestions");
  });
});
