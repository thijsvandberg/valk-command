import { describe, it, expect } from "vitest";
import { buildOpenSubtasksReport, formatStatusLabel, type ReportStory } from "./open-subtasks-report";

const BASE = "https://new-story.atlassian.net/browse";

describe("formatStatusLabel", () => {
  it("collapses TO DO to TODO", () => {
    expect(formatStatusLabel("TO DO")).toBe("TODO");
    expect(formatStatusLabel("To Do")).toBe("TODO");
  });

  it("uppercases other statuses as-is", () => {
    expect(formatStatusLabel("Done")).toBe("DONE");
    expect(formatStatusLabel("In Progress")).toBe("IN PROGRESS");
  });
});

describe("buildOpenSubtasksReport", () => {
  it("formats a parent with assignee and its open subtasks", () => {
    const stories: ReportStory[] = [
      {
        key: "VPL-46187",
        title: "Update gift card transaction code to 904-102",
        status: "DONE",
        assignee: "Frank",
        openSubtasks: [
          { key: "VPL-46336", title: "Finalize story", status: "TO DO" },
        ],
      },
    ];

    expect(buildOpenSubtasksReport(stories)).toBe(
      `Update gift card transaction code to 904-102 (DONE) - ${BASE}/VPL-46187 (Frank)\n` +
        ` - Finalize story (TODO) - ${BASE}/VPL-46336`,
    );
  });

  it("omits the assignee suffix when unassigned", () => {
    const stories: ReportStory[] = [
      {
        key: "VPL-1",
        title: "Orphan story",
        status: "DONE",
        assignee: null,
        openSubtasks: [{ key: "VPL-2", title: "Loose end", status: "TO DO" }],
      },
    ];

    expect(buildOpenSubtasksReport(stories)).toBe(
      `Orphan story (DONE) - ${BASE}/VPL-1\n - Loose end (TODO) - ${BASE}/VPL-2`,
    );
  });

  it("drops stories that have no open subtasks", () => {
    const stories: ReportStory[] = [
      { key: "VPL-1", title: "Cleared", status: "DONE", assignee: "Anna", openSubtasks: [] },
      {
        key: "VPL-3",
        title: "Still open",
        status: "DONE",
        assignee: "Bob",
        openSubtasks: [{ key: "VPL-4", title: "Work", status: "IN PROGRESS" }],
      },
    ];

    const result = buildOpenSubtasksReport(stories);
    expect(result).not.toContain("Cleared");
    expect(result).toBe(
      `Still open (DONE) - ${BASE}/VPL-3 (Bob)\n - Work (IN PROGRESS) - ${BASE}/VPL-4`,
    );
  });

  it("joins multiple story blocks without a blank line between them", () => {
    const stories: ReportStory[] = [
      {
        key: "VPL-1",
        title: "First",
        status: "DONE",
        assignee: "Anna",
        openSubtasks: [{ key: "VPL-2", title: "A", status: "TO DO" }],
      },
      {
        key: "VPL-3",
        title: "Second",
        status: "DONE",
        assignee: "Bob",
        openSubtasks: [{ key: "VPL-4", title: "B", status: "TO DO" }],
      },
    ];

    expect(buildOpenSubtasksReport(stories)).toBe(
      `First (DONE) - ${BASE}/VPL-1 (Anna)\n - A (TODO) - ${BASE}/VPL-2\n` +
        `Second (DONE) - ${BASE}/VPL-3 (Bob)\n - B (TODO) - ${BASE}/VPL-4`,
    );
  });
});
