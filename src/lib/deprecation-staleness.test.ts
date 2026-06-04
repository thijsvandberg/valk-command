import { describe, it, expect } from "vitest";
import {
  scoreStaleness,
  isPoMetadataEmpty,
  effectiveLastActivity,
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

  // --- effective last-activity tests ---

  it("uses the comment timestamp when it is more recent than jiraUpdatedAt", () => {
    // jiraUpdatedAt is 400 days old (stale); a comment 30 days ago should reset
    // the effective activity and bring age staleness to zero.
    const withoutComment = scoreStaleness(
      { jiraUpdatedAt: daysAgo(400), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const withRecentComment = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(400),
        sprintName: "1",
        status: "In Progress",
        hasPoMetadata: true,
        lastCommentAt: daysAgo(30),
      },
      NOW,
    );
    // Without comment: age contribution is non-zero.
    expect(withoutComment.score).toBeGreaterThan(0);
    // With a recent comment: effective age is 30 days < 90-day floor, so no age staleness.
    expect(withRecentComment.score).toBe(0);
  });

  it("falls back to jiraUpdatedAt when lastCommentAt is older", () => {
    // A comment that is older than jiraUpdatedAt should not increase staleness.
    const baseline = scoreStaleness(
      { jiraUpdatedAt: daysAgo(10), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const withOlderComment = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(10),
        sprintName: "1",
        status: "In Progress",
        hasPoMetadata: true,
        lastCommentAt: daysAgo(400),
      },
      NOW,
    );
    // jiraUpdatedAt wins; score unchanged.
    expect(withOlderComment.score).toBe(baseline.score);
  });

  it("gracefully falls back when lastCommentAt is null", () => {
    const without = scoreStaleness(
      { jiraUpdatedAt: daysAgo(315), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const withNull = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(315),
        sprintName: "1",
        status: "In Progress",
        hasPoMetadata: true,
        lastCommentAt: null,
      },
      NOW,
    );
    expect(withNull.score).toBeCloseTo(without.score, 5);
  });

  // --- epic dampener tests ---

  it("dampens the age component when the linked epic has been active recently", () => {
    // Old ticket (315 days, half-ramp) under a recently-active epic (30 days).
    const withoutEpic = scoreStaleness(
      { jiraUpdatedAt: daysAgo(315), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const withActiveEpic = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(315),
        sprintName: "1",
        status: "In Progress",
        hasPoMetadata: true,
        epicLastActivityAt: daysAgo(30),
      },
      NOW,
    );
    // Epic dampener must reduce the score, but not to zero (it only nudges).
    expect(withActiveEpic.score).toBeLessThan(withoutEpic.score);
    expect(withActiveEpic.score).toBeGreaterThan(0);
    expect(withActiveEpic.rationale).toContain("linked epic recently active (dampened)");
  });

  it("does not apply the epic dampener when the epic activity is outside the 180-day window", () => {
    const withoutEpic = scoreStaleness(
      { jiraUpdatedAt: daysAgo(315), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const withStaleEpic = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(315),
        sprintName: "1",
        status: "In Progress",
        hasPoMetadata: true,
        epicLastActivityAt: daysAgo(200),
      },
      NOW,
    );
    // 200 days > 180-day window: dampener does not fire.
    expect(withStaleEpic.score).toBeCloseTo(withoutEpic.score, 5);
    expect(withStaleEpic.rationale).not.toContain("dampened");
  });

  it("caps the epic dampener so it cannot eliminate the age contribution entirely", () => {
    // Maximally stale ticket age (at ceiling, 540 days) under the most recently
    // active possible epic (today). The dampener cap (40% of WEIGHT_AGE) means
    // at most 0.4 * 0.5 = 0.2 is removed; the remaining age is >= 0.3.
    const withMaxActiveEpic = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(540),
        sprintName: "1",
        status: "In Progress",
        hasPoMetadata: true,
        epicLastActivityAt: daysAgo(1),
      },
      NOW,
    );
    // Full age weight = 0.5; max dampener removes at most 0.4 * 0.5 = 0.2.
    // So score must be >= 0.5 - 0.2 = 0.3.
    expect(withMaxActiveEpic.score).toBeGreaterThanOrEqual(0.3);
  });

  it("gracefully falls back when epicLastActivityAt is null", () => {
    const without = scoreStaleness(
      { jiraUpdatedAt: daysAgo(315), sprintName: "1", status: "In Progress", hasPoMetadata: true },
      NOW,
    );
    const withNull = scoreStaleness(
      {
        jiraUpdatedAt: daysAgo(315),
        sprintName: "1",
        status: "In Progress",
        hasPoMetadata: true,
        epicLastActivityAt: null,
      },
      NOW,
    );
    expect(withNull.score).toBeCloseTo(without.score, 5);
    expect(withNull.rationale).not.toContain("dampened");
  });
});

describe("effectiveLastActivity", () => {
  it("returns the more recent of jiraUpdatedAt and lastCommentAt", () => {
    const older = daysAgo(100);
    const newer = daysAgo(10);
    expect(effectiveLastActivity(older, newer)).toBe(newer);
    expect(effectiveLastActivity(newer, older)).toBe(newer);
  });

  it("returns jiraUpdatedAt when lastCommentAt is null", () => {
    const ts = daysAgo(50);
    expect(effectiveLastActivity(ts, null)).toBe(ts);
    expect(effectiveLastActivity(ts, undefined)).toBe(ts);
  });

  it("returns lastCommentAt when jiraUpdatedAt is null", () => {
    const ts = daysAgo(50);
    expect(effectiveLastActivity(null, ts)).toBe(ts);
    expect(effectiveLastActivity(undefined, ts)).toBe(ts);
  });

  it("returns null when both are null or undefined", () => {
    expect(effectiveLastActivity(null, null)).toBeNull();
    expect(effectiveLastActivity(undefined, undefined)).toBeNull();
    expect(effectiveLastActivity(null, undefined)).toBeNull();
  });

  it("returns the same value when both timestamps are equal", () => {
    const ts = daysAgo(30);
    expect(effectiveLastActivity(ts, ts)).toBe(ts);
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
