// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeTicketEditState } from "./ticket-state";

describe("computeTicketEditState", () => {
  it("returns clean when no edits exist", () => {
    expect(computeTicketEditState([], "abc")).toBe("clean");
  });

  it("returns draft when only draft edits exist", () => {
    const edits = [{ baseJiraVersion: "abc", isDraft: true }];
    expect(computeTicketEditState(edits, "abc")).toBe("draft");
  });

  it("returns local_edits when saved edits exist and base matches", () => {
    const edits = [{ baseJiraVersion: "abc", isDraft: false }];
    expect(computeTicketEditState(edits, "abc")).toBe("local_edits");
  });

  it("returns conflict when saved edits exist but base does not match", () => {
    const edits = [{ baseJiraVersion: "old", isDraft: false }];
    expect(computeTicketEditState(edits, "new")).toBe("conflict");
  });

  it("returns draft when only drafts exist even with mismatched base", () => {
    const edits = [{ baseJiraVersion: "old", isDraft: true }];
    expect(computeTicketEditState(edits, "new")).toBe("draft");
  });

  it("returns local_edits with mixed draft and saved edits on matching base", () => {
    const edits = [
      { baseJiraVersion: "abc", isDraft: true },
      { baseJiraVersion: "abc", isDraft: false },
    ];
    expect(computeTicketEditState(edits, "abc")).toBe("local_edits");
  });
});
