import { describe, it, expect } from "vitest";
import { isDraftKey, DRAFT_KEY_PREFIX } from "./draft-key";

describe("isDraftKey", () => {
  it("is true for synthetic draft keys", () => {
    expect(isDraftKey("DRAFT-748b82f8")).toBe(true);
    expect(isDraftKey(`${DRAFT_KEY_PREFIX}abc`)).toBe(true);
  });

  it("is false for real Jira keys", () => {
    expect(isDraftKey("VPL-46869")).toBe(false);
    expect(isDraftKey("BRDG-1")).toBe(false);
  });

  it("is false for an empty string", () => {
    expect(isDraftKey("")).toBe(false);
  });

  it("only matches the prefix at the start", () => {
    expect(isDraftKey("VPL-DRAFT-1")).toBe(false);
  });
});
