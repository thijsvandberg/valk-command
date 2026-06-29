import { describe, it, expect } from "vitest";
import { computeContentHash, ticketNeedsTitle, buildFollowUpContent, selectCurrentDescription, buildFindRelatedTaskBody, FIND_RELATED_MODEL } from "./story-writer-messages";

describe("buildFindRelatedTaskBody", () => {
  it("defaults to the lighter find-related model", () => {
    const body = buildFindRelatedTaskBody({ key: "VPL-1" }, "conv-1");
    expect(body.model).toBe(FIND_RELATED_MODEL);
    expect(body.skill).toBe("find-related");
    expect(body.conversationId).toBe("conv-1");
  });

  it("falls back to the key as the search arg when no query is given (button path)", () => {
    const body = buildFindRelatedTaskBody({ key: "VPL-1" }, "conv-1");
    expect(body.args).toMatchObject({ args: "VPL-1", key: "VPL-1", depth: "quick" });
    expect((body.args as Record<string, unknown>).query).toBeUndefined();
    expect((body.args as Record<string, unknown>).sprintId).toBeUndefined();
  });

  it("carries the query and sprint scoping when targeted", () => {
    const body = buildFindRelatedTaskBody(
      { key: "VPL-1", query: "domain resolving", sprintId: "100", sprintName: "BT: 139" },
      "conv-1",
    );
    expect(body.args).toMatchObject({
      args: "domain resolving",
      key: "VPL-1",
      query: "domain resolving",
      sprintId: "100",
      sprintName: "BT: 139",
      depth: "quick",
    });
  });

  it("omits sprintName when only an id is present", () => {
    const body = buildFindRelatedTaskBody({ key: "VPL-1", query: "x", sprintId: "100" }, "conv-1");
    expect((body.args as Record<string, unknown>).sprintId).toBe("100");
    expect((body.args as Record<string, unknown>).sprintName).toBeUndefined();
  });

  it("honours an explicit model override", () => {
    const body = buildFindRelatedTaskBody({ key: "VPL-1" }, "conv-1", "claude-opus-4-6");
    expect(body.model).toBe("claude-opus-4-6");
  });
});

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

describe("selectCurrentDescription", () => {
  it("prefers the editor draft over the Jira description", () => {
    expect(selectCurrentDescription("editor content", "jira content")).toBe("editor content");
  });

  it("uses the editor draft even when Jira description is empty", () => {
    expect(selectCurrentDescription("editor content", null)).toBe("editor content");
    expect(selectCurrentDescription("editor content", "")).toBe("editor content");
  });

  it("falls back to Jira description when editor draft is untouched", () => {
    expect(selectCurrentDescription(null, "jira content")).toBe("jira content");
    expect(selectCurrentDescription("", "jira content")).toBe("jira content");
    expect(selectCurrentDescription("   ", "jira content")).toBe("jira content");
  });

  it("returns (empty) when neither has content", () => {
    expect(selectCurrentDescription(null, null)).toBe("(empty)");
    expect(selectCurrentDescription("", "")).toBe("(empty)");
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

  it("instructs wrapping an investigation in an <investigation> block (BRDG-435)", () => {
    const edit = buildFollowUpContent(baseSession, "VPL-1", "rewrite the AC", false);
    expect(edit.content).toContain("<investigation>");
    const question = buildFollowUpContent(baseSession, "VPL-1", "investigate the login flow", false);
    expect(question.content).toContain("<investigation>");
  });
});
