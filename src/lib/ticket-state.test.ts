// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computeTicketEditState } from "./ticket-state";

describe("computeTicketEditState", () => {
  it("returns clean when no edits exist", () => {
    expect(computeTicketEditState([], "abc")).toBe("clean");
  });

  it("returns local_edits for autosaved (draft-flagged) edits on a matching base", () => {
    const edits = [{ baseJiraVersion: "abc", isDraft: true }];
    expect(computeTicketEditState(edits, "abc")).toBe("local_edits");
  });

  it("returns local_edits for saved edits on a matching base", () => {
    const edits = [{ baseJiraVersion: "abc", isDraft: false }];
    expect(computeTicketEditState(edits, "abc")).toBe("local_edits");
  });

  it("returns conflict when a saved edit sits on an outdated base", () => {
    const edits = [{ baseJiraVersion: "old", isDraft: false }];
    expect(computeTicketEditState(edits, "new")).toBe("conflict");
  });

  it("returns conflict for autosaved edits on an outdated base (formerly hidden as draft)", () => {
    const edits = [{ baseJiraVersion: "old", isDraft: true }];
    expect(computeTicketEditState(edits, "new")).toBe("conflict");
  });

  it("ignores the isDraft flag entirely for mixed edits on a matching base", () => {
    const edits = [
      { baseJiraVersion: "abc", isDraft: true },
      { baseJiraVersion: "abc", isDraft: false },
    ];
    expect(computeTicketEditState(edits, "abc")).toBe("local_edits");
  });
});
