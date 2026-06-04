import { describe, it, expect } from "vitest";
import {
  deriveSupersededVerdict,
  HIGH_OVERLAP_THRESHOLD,
  type SupersededMatch,
} from "./superseded-verdict";

const NOW = "2026-06-04T00:00:00.000Z";
const OLDER = "2026-01-01T00:00:00.000Z";
const NEWER = "2026-06-01T00:00:00.000Z";

function match(overrides: Partial<SupersededMatch> = {}): SupersededMatch {
  return {
    key: "BT-200",
    score: 90,
    title: "Survivor ticket",
    status: "In Progress",
    reason: "Same login refactor",
    jiraUpdatedAt: NEWER,
    ...overrides,
  };
}

describe("deriveSupersededVerdict", () => {
  it("flags this ticket when a high-overlap match is newer and active", () => {
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: OLDER,
      ticketStatus: "Backlog",
      matches: [match()],
    });
    expect(verdict).not.toBeNull();
    expect(verdict!.evidence.supersededBy).toBe("BT-200");
    expect(verdict!.evidence.overlapScore).toBe(90);
    expect(verdict!.evidence.matchReason).toBe("Same login refactor");
    expect(verdict!.evidence.survivorBasis).toEqual(
      expect.arrayContaining(["newer", "active"]),
    );
    expect(verdict!.rationale).toBe("Likely superseded by BT-200");
    // Corroboration bonus on top of 0.9 overlap.
    expect(verdict!.score).toBeGreaterThan(0.9);
  });

  it("flags on a newer match even when its status is backlog (recency alone)", () => {
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: OLDER,
      ticketStatus: "Backlog",
      matches: [match({ status: "Backlog", jiraUpdatedAt: NEWER })],
    });
    expect(verdict).not.toBeNull();
    expect(verdict!.evidence.survivorBasis).toEqual(["newer"]);
  });

  it("flags on an active match even when recency is unknown (status alone)", () => {
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: NOW,
      ticketStatus: "Backlog",
      matches: [match({ status: "In Review", jiraUpdatedAt: null })],
    });
    expect(verdict).not.toBeNull();
    expect(verdict!.evidence.survivorBasis).toEqual(["active"]);
  });

  it("abstains when this ticket is the survivor (match is older and not active)", () => {
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: NEWER,
      ticketStatus: "In Progress",
      matches: [match({ status: "Backlog", jiraUpdatedAt: OLDER })],
    });
    expect(verdict).toBeNull();
  });

  it("abstains when overlap is below the high-overlap threshold", () => {
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: OLDER,
      ticketStatus: "Backlog",
      matches: [match({ score: HIGH_OVERLAP_THRESHOLD - 1 })],
    });
    expect(verdict).toBeNull();
  });

  it("abstains when the only match is done (a done peer is not an active survivor)", () => {
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: NOW,
      ticketStatus: "Backlog",
      matches: [match({ status: "Done", jiraUpdatedAt: null })],
    });
    expect(verdict).toBeNull();
  });

  it("picks the strongest-overlap survivor when several qualify", () => {
    const verdict = deriveSupersededVerdict({
      ticketUpdatedAt: OLDER,
      ticketStatus: "Backlog",
      matches: [
        match({ key: "BT-LOW", score: 75, jiraUpdatedAt: NEWER }),
        match({ key: "BT-HIGH", score: 95, jiraUpdatedAt: NEWER }),
      ],
    });
    expect(verdict!.evidence.supersededBy).toBe("BT-HIGH");
  });
});
