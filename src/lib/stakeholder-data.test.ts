import { describe, it, expect } from "vitest";
import {
  toStakeholderTickets,
  toUpcomingTickets,
  toStakeholderSprint,
  buildMarkdownSummary,
} from "./stakeholder-data";
import type { Ticket } from "@/types/ticket";

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test ticket",
    type: "story",
    epic: "BT: UPSELL",
    epicKey: "VPL-100",
    jiraStatus: "IN PROGRESS",
    storyPoints: 3,
    assignee: { name: "Alice", initials: "AL", color: "hsl(200, 55%, 50%)" },
    flagged: false,
    poStatus: "Ready",
    qualityScore: 85,
    editState: "clean",
    notes: "some internal note",
    jiraRank: 1,
    sprintId: "42",
    jiraUpdatedAt: null,
    removedFromJiraAt: null,
    ...overrides,
  };
}

describe("toStakeholderTickets", () => {
  it("strips PO-internal fields", () => {
    const result = toStakeholderTickets([makeTicket()]);
    const t = result[0];
    expect(t).not.toHaveProperty("key");
    expect(t).not.toHaveProperty("qualityScore");
    expect(t).not.toHaveProperty("poStatus");
    expect(t).not.toHaveProperty("notes");
    expect(t).not.toHaveProperty("editState");
    expect(t).not.toHaveProperty("flagged");
  });

  it("sets jiraKey to null (keys always hidden in main sections)", () => {
    const result = toStakeholderTickets([makeTicket()]);
    expect(result[0].jiraKey).toBeNull();
  });

  it("maps DONE to Completed", () => {
    const result = toStakeholderTickets([makeTicket({ jiraStatus: "DONE" })]);
    expect(result[0].status).toBe("Completed");
  });

  it("maps IN PROGRESS to In Progress", () => {
    const result = toStakeholderTickets([makeTicket({ jiraStatus: "IN PROGRESS" })]);
    expect(result[0].status).toBe("In Progress");
  });

  it("maps TEST to In Review", () => {
    const result = toStakeholderTickets([makeTicket({ jiraStatus: "TEST" })]);
    expect(result[0].status).toBe("In Review");
  });

  it("maps TO DO and unknown statuses to To Do", () => {
    expect(toStakeholderTickets([makeTicket({ jiraStatus: "TO DO" })])[0].status).toBe("To Do");
    expect(toStakeholderTickets([makeTicket({ jiraStatus: "DEPRECATED" })])[0].status).toBe("To Do");
  });

  it("preserves title, epic, storyPoints, and assignee name/initials", () => {
    const result = toStakeholderTickets([makeTicket()]);
    const t = result[0];
    expect(t.title).toBe("Test ticket");
    expect(t.epic).toBe("BT: UPSELL");
    expect(t.storyPoints).toBe(3);
    expect(t.assignee?.name).toBe("Alice");
    expect(t.assignee?.initials).toBe("AL");
  });

  it("sets assignee to null for unassigned tickets", () => {
    const result = toStakeholderTickets([makeTicket({ assignee: null })]);
    expect(result[0].assignee).toBeNull();
  });
});

describe("toUpcomingTickets", () => {
  it("includes jiraKey for the show-details toggle", () => {
    const result = toUpcomingTickets([makeTicket({ key: "VPL-99" })]);
    expect(result[0].jiraKey).toBe("VPL-99");
  });

  it("still strips PO-internal fields", () => {
    const result = toUpcomingTickets([makeTicket()]);
    expect(result[0]).not.toHaveProperty("qualityScore");
    expect(result[0]).not.toHaveProperty("poStatus");
    expect(result[0]).not.toHaveProperty("notes");
  });
});

describe("toStakeholderSprint", () => {
  it("computes daysRemaining from endDate", () => {
    const now = new Date("2025-04-14T00:00:00Z");
    const sprint = toStakeholderSprint(
      { name: "Sprint 1", startDate: "2025-04-07T00:00:00Z", endDate: "2025-04-21T00:00:00Z" },
      now,
    );
    expect(sprint.daysRemaining).toBe(7);
  });

  it("sets daysRemaining to 0 for past sprints", () => {
    const now = new Date("2025-04-30T00:00:00Z");
    const sprint = toStakeholderSprint(
      { name: "Sprint 1", startDate: "2025-04-07T00:00:00Z", endDate: "2025-04-14T00:00:00Z" },
      now,
    );
    expect(sprint.daysRemaining).toBe(0);
  });

  it("sets daysRemaining to null when no endDate", () => {
    const sprint = toStakeholderSprint({ name: "Sprint 1", startDate: null, endDate: null });
    expect(sprint.daysRemaining).toBeNull();
  });

  it("always sets goal to null (not in data model yet)", () => {
    const sprint = toStakeholderSprint({ name: "Sprint 1", startDate: null, endDate: null });
    expect(sprint.goal).toBeNull();
  });
});

describe("buildMarkdownSummary", () => {
  const sprint = { name: "Sprint 5", startDate: null, endDate: null, daysRemaining: null, goal: null };

  const done = [
    { title: "Feature A", epic: "BT: UPSELL", status: "Completed" as const, storyPoints: 5, assignee: null, jiraKey: null },
    { title: "Feature B", epic: "BT: UPSELL", status: "Completed" as const, storyPoints: 3, assignee: null, jiraKey: null },
  ];
  const inProgress = [
    { title: "Feature C", epic: null, status: "In Progress" as const, storyPoints: 2, assignee: { name: "Alice", initials: "AL" }, jiraKey: null },
  ];
  const todo: typeof done = [];
  const upcoming = [
    { title: "Feature D", epic: "Other", status: "To Do" as const, storyPoints: null, assignee: null, jiraKey: "VPL-99" },
  ];

  it("includes sprint name in heading", () => {
    const md = buildMarkdownSummary(sprint, done, inProgress, todo, [], null);
    expect(md).toContain("## Sprint: Sprint 5");
  });

  it("includes progress line", () => {
    const md = buildMarkdownSummary(sprint, done, inProgress, todo, [], null);
    expect(md).toContain("8 of 10 story points");
  });

  it("includes completed section", () => {
    const md = buildMarkdownSummary(sprint, done, inProgress, todo, [], null);
    expect(md).toContain("### Completed");
    expect(md).toContain("Feature A");
    expect(md).toContain("Feature B");
  });

  it("includes assignee name in in-progress items", () => {
    const md = buildMarkdownSummary(sprint, done, inProgress, todo, [], null);
    expect(md).toContain("Alice");
  });

  it("includes upcoming section when sprint name is provided", () => {
    const md = buildMarkdownSummary(sprint, done, inProgress, todo, upcoming, "Sprint 6");
    expect(md).toContain("### Upcoming (Sprint 6)");
    expect(md).toContain("Feature D");
  });

  it("omits upcoming section when no next sprint name", () => {
    const md = buildMarkdownSummary(sprint, done, inProgress, todo, upcoming, null);
    expect(md).not.toContain("### Upcoming");
  });
});
