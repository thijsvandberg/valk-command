import { describe, it, expect } from "vitest";
import {
  sessionToSessionTicket,
  formatTimeAgo,
  hasJiraChanges,
  type ActiveSession,
} from "@/types/story-writer";

function buildSession(overrides?: Partial<ActiveSession>): ActiveSession {
  return {
    sessionId: "sess-1",
    ticketKey: "VPL-100",
    title: "A draft",
    sprintName: "42",
    epic: "Group Reservations",
    epicKey: "VPL-E1",
    issueType: "story",
    status: "IN PROGRESS",
    readiness: "ready_to_refine",
    storyPoints: 5,
    guestimation: 3,
    businessValue: 4,
    qualityScore: 80,
    assignee: { name: "Jane Doe", initials: "JD", color: "hsl(1, 55%, 50%)" },
    flagged: true,
    notes: "Some notes",
    openSubtaskCount: 2,
    totalSubtaskCount: 3,
    updatedAt: "2026-06-01T10:00:00Z",
    jiraUpdatedAt: "2026-06-01T09:00:00Z",
    targetTicketKey: null,
    targetTitle: null,
    removedFromJira: false,
    ...overrides,
  };
}

describe("sessionToSessionTicket", () => {
  it("maps session fields onto a full Ticket shape", () => {
    const t = sessionToSessionTicket(buildSession());
    expect(t.key).toBe("VPL-100");
    expect(t.title).toBe("A draft");
    expect(t.type).toBe("story");
    expect(t.jiraStatus).toBe("IN PROGRESS");
    expect(t.epic).toBe("Group Reservations");
    expect(t.epicKey).toBe("VPL-E1");
    expect(t.storyPoints).toBe(5);
    expect(t.guestimation).toBe(3);
    expect(t.businessValue).toBe(4);
    expect(t.qualityScore).toBe(80);
    expect(t.flagged).toBe(true);
    expect(t.notes).toBe("Some notes");
    expect(t.readiness).toBe("ready_to_refine");
    expect(t.assignee).toMatchObject({ name: "Jane Doe" });
    expect(t.openSubtaskCount).toBe(2);
    expect(t.totalSubtaskCount).toBe(3);
  });

  it("maps sprintName (a sprint id) onto sprintId", () => {
    expect(sessionToSessionTicket(buildSession({ sprintName: "42" })).sprintId).toBe("42");
    expect(sessionToSessionTicket(buildSession({ sprintName: null })).sprintId).toBeUndefined();
  });

  it("carries session-only fields alongside the Ticket fields", () => {
    const t = sessionToSessionTicket(
      buildSession({ sessionId: "sess-x", targetTicketKey: "VPL-200", targetTitle: "Target" }),
    );
    expect(t.sessionId).toBe("sess-x");
    expect(t.sessionUpdatedAt).toBe("2026-06-01T10:00:00Z");
    expect(t.targetTicketKey).toBe("VPL-200");
    expect(t.targetTitle).toBe("Target");
  });

  it("never marks a removed session as removedFromJira (no strikethrough)", () => {
    const t = sessionToSessionTicket(buildSession({ removedFromJira: true }));
    expect(t.removedFromJiraAt).toBeUndefined();
  });

  it("falls back to a safe ticket type and status when missing", () => {
    const t = sessionToSessionTicket(buildSession({ issueType: null, status: "unknown" }));
    expect(t.type).toBe("task");
    // The raw status string passes through; the pill renders it as-is.
    expect(t.jiraStatus).toBe("unknown");
  });
});

describe("formatTimeAgo", () => {
  const now = new Date("2026-06-01T12:00:00Z").getTime();
  it("renders 'just now' under a minute", () => {
    expect(formatTimeAgo("2026-06-01T11:59:30Z", now)).toBe("just now");
  });
  it("renders minutes, hours, and days", () => {
    expect(formatTimeAgo("2026-06-01T11:30:00Z", now)).toBe("30m ago");
    expect(formatTimeAgo("2026-06-01T06:00:00Z", now)).toBe("6h ago");
    expect(formatTimeAgo("2026-05-30T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("hasJiraChanges", () => {
  it("is true when Jira changed after the draft was saved", () => {
    expect(hasJiraChanges({ updatedAt: "2026-06-01T09:00:00Z", jiraUpdatedAt: "2026-06-01T10:00:00Z" })).toBe(true);
  });
  it("is false when the draft is newer or either timestamp is missing", () => {
    expect(hasJiraChanges({ updatedAt: "2026-06-01T10:00:00Z", jiraUpdatedAt: "2026-06-01T09:00:00Z" })).toBe(false);
    expect(hasJiraChanges({ updatedAt: null, jiraUpdatedAt: "2026-06-01T10:00:00Z" })).toBe(false);
    expect(hasJiraChanges({ updatedAt: "2026-06-01T10:00:00Z", jiraUpdatedAt: null })).toBe(false);
  });
});
