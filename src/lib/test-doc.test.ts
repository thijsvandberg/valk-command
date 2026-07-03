import { describe, expect, it } from "vitest";
import { appendTestDocBlock, deriveTestDocState, stripTestDocBlock } from "./test-doc";

const DOC = "**Forgot password link**\n\n- Confirm the link navigates to the new portal";

describe("appendTestDocBlock", () => {
  it("appends a single expand block to a plain description", () => {
    const result = appendTestDocBlock("### Story\n\nSome content", DOC);
    expect(result).toBe(
      `### Story\n\nSome content\n\n:::expand Test documentation\n${DOC}\n:::\n`,
    );
  });

  it("replaces an existing block instead of duplicating", () => {
    const withBlock = appendTestDocBlock("### Story\n\nContent", "old doc");
    const result = appendTestDocBlock(withBlock, DOC);
    expect(result.match(/:::expand Test documentation/g)).toHaveLength(1);
    expect(result).toContain(DOC);
    expect(result).not.toContain("old doc");
    expect(result).toContain("### Story\n\nContent");
  });

  it("does not touch other expand blocks", () => {
    const description = ":::expand Screenshots\nimg\n:::\n\nMore text";
    const result = appendTestDocBlock(description, DOC);
    expect(result).toContain(":::expand Screenshots\nimg\n:::");
    expect(result.match(/:::expand Test documentation/g)).toHaveLength(1);
  });

  it("handles an empty description", () => {
    const result = appendTestDocBlock("", DOC);
    expect(result).toBe(`:::expand Test documentation\n${DOC}\n:::\n`);
  });

  it("replaces a block that is not at the end", () => {
    const description = `Intro\n\n:::expand Test documentation\nold\n:::\n\nTrailing section`;
    const result = appendTestDocBlock(description, DOC);
    expect(result.match(/:::expand Test documentation/g)).toHaveLength(1);
    expect(result).toContain("Trailing section");
    expect(result).not.toContain("\nold\n");
    expect(result.indexOf("Trailing section")).toBeLessThan(
      result.indexOf(":::expand Test documentation"),
    );
  });
});

describe("stripTestDocBlock", () => {
  it("returns the description unchanged when no block exists", () => {
    expect(stripTestDocBlock("plain text")).toBe("plain text");
  });

  it("removes the block and trailing whitespace", () => {
    const withBlock = appendTestDocBlock("Content", DOC);
    expect(stripTestDocBlock(withBlock)).toBe("Content");
  });
});

describe("deriveTestDocState", () => {
  it("prefers an accepted doc over a draft", () => {
    expect(deriveTestDocState({ testDoc: "doc", testDocDraft: "draft" })).toBe("accepted");
  });

  it("reads a draft when there is no accepted doc", () => {
    expect(deriveTestDocState({ testDoc: null, testDocDraft: "draft" })).toBe("draft");
  });

  it("reads not_needed only from the not_stakeholder_relevant classification", () => {
    expect(deriveTestDocState({ testDocClassification: "not_stakeholder_relevant" })).toBe("not_needed");
    expect(deriveTestDocState({ testDocClassification: "ok" })).toBeNull();
  });

  it("returns null for an absent or empty row", () => {
    expect(deriveTestDocState(null)).toBeNull();
    expect(deriveTestDocState(undefined)).toBeNull();
    expect(deriveTestDocState({})).toBeNull();
  });
});
