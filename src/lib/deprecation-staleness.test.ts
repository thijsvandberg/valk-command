import { describe, it, expect } from "vitest";
import {
  scoreStaleness,
  isPoMetadataEmpty,
  STALENESS_CANDIDATE_THRESHOLD,
} from "./deprecation-staleness";

// Fixed clock so age-based scoring is deterministic.
const NOW = new Date("2025-06-01T00:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

describe("scoreStaleness", () => {
  it("flags an old, never-scheduled, backlog-status, empty-metadata ticket as a candidate", () => {
    const result = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(600),
        sprintName: "",
        status: "Backlog",
        hasPoMetadata: false,
      },
      NOW,
    );
    expect(result.score).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(STALENESS_CANDIDATE_THRESHOLD);
    expect(result.rationale).toContain("never in a sprint");
    expect(result.rationale).toContain("no PO metadata");
  });

  it("does not flag a fresh, well-prepared, scheduled ticket", () => {
    const result = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(5),
        sprintName: "42",
        status: "In Progress",
        hasPoMetadata: true,
      },
      NOW,
    );
    expect(result.score).toBe(0);
    expect(result.score).toBeLessThan(STALENESS_CANDIDATE_THRESHOLD);
    expect(result.rationale).toContain("no staleness signals");
  });

  it("treats ages below the floor as contributing no age staleness", () => {
    // 89 days < 90-day floor: age weight should be 0, only backlog signals.
    const result = scoreStaleness(
      { jiraUpdatedAt: daysAgo(89), sprintName: "", status: "To Do", hasPoMetadata: false },
      NOW,
    );
    // never-in-sprint (.25) + backlog status (.15) + empty meta (.1) = .5, no age.
    expect(result.score).toBeCloseTo(0.5, 5);
    expect(result.rationale).not.toContain("No activity since");
  });

  it("ramps age between floor and ceiling", () => {
    // Halfway between 90 and 540 days = 315 days -> half of the 0.5 age weight.
    const result = scoreStaleness(
      { jiraUpdatedAt: daysAgo(315), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    expect(result.score).toBeCloseTo(0.25, 5);
    expect(result.rationale).toContain("No activity since");
  });

  it("saturates age contribution at the ceiling", () => {
    const atCeiling = scoreStaleness(
      { jiraUpdatedAt: daysAgo(540), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const beyond = scoreStaleness(
      { jiraUpdatedAt: daysAgo(2000), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    expect(atCeiling.score).toBeCloseTo(0.5, 5);
    expect(beyond.score).toBeCloseTo(0.5, 5);
  });

  it("does not award the never-in-sprint signal when the ticket is in a sprint", () => {
    const inSprint = scoreStaleness(
      { jiraUpdatedAt: daysAgo(89), sprintName: "7", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    expect(inSprint.score).toBe(0);
  });

  it("awards the never-in-sprint signal for empty or null sprintName", () => {
    const empty = scoreStaleness(
      { jiraUpdatedAt: daysAgo(10), sprintName: "", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const nul = scoreStaleness(
      { jiraUpdatedAt: daysAgo(10), sprintName: null, status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    expect(empty.score).toBeCloseTo(0.25, 5);
    expect(nul.score).toBeCloseTo(0.25, 5);
  });

  it("treats a missing update timestamp as maximally aged", () => {
    const result = scoreStaleness(
      { jiraUpdatedAt: null, sprintName: "9", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    expect(result.score).toBeCloseTo(0.5, 5);
    expect(result.rationale).toContain("No recorded activity date");
  });

  it("matches backlog-like statuses case-insensitively", () => {
    const result = scoreStaleness(
      { jiraUpdatedAt: daysAgo(10), sprintName: "1", status: "TODO", hasPoMetadata: true },
      NOW,
    );
    expect(result.score).toBeCloseTo(0.15, 5);
  });

  it("clamps the score to 0..1", () => {
    const result = scoreStaleness(
      { jiraUpdatedAt: daysAgo(5000), sprintName: "", status: "Backlog", hasPoMetadata: false },
      NOW,
    );
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("isPoMetadataEmpty", () => {
  it("returns true when no preparation fields are set", () => {
    expect(isPoMetadataEmpty({})).toBe(true);
    expect(
      isPoMetadataEmpty({
        readiness: null,
        poStatus: null,
        qualityScore: null,
        effortScores: null,
        poNotes: null,
        poPriority: null,
        businessValue: null,
      }),
    ).toBe(true);
  });

  it("returns false when any preparation field is set", () => {
    expect(isPoMetadataEmpty({ poNotes: "needs spec" })).toBe(false);
    expect(isPoMetadataEmpty({ businessValue: 0 })).toBe(false);
    expect(isPoMetadataEmpty({ poPriority: 0 })).toBe(false);
    expect(isPoMetadataEmpty({ qualityScore: 0 })).toBe(false);
    expect(isPoMetadataEmpty({ readiness: "ready" })).toBe(false);
  });
});
