import { describe, it, expect } from "vitest";
import {
  availableTicketTabs,
  defaultTicketTab,
  resolveTicketTab,
  buildTicketDetailUrl,
} from "./ticket-detail-url";

describe("availableTicketTabs", () => {
  it("gives epics children/content/history but no review or development", () => {
    expect(availableTicketTabs("epic")).toEqual(["children", "content", "history"]);
  });

  it("gives subtasks only content and history", () => {
    expect(availableTicketTabs("subtask")).toEqual(["content", "history"]);
  });

  it.each(["story", "task", "bug"])("gives %s the full non-epic tab set", (type) => {
    expect(availableTicketTabs(type)).toEqual(["content", "history", "review", "development"]);
  });
});

describe("defaultTicketTab", () => {
  it("defaults epics to children", () => {
    expect(defaultTicketTab("epic")).toBe("children");
  });

  it.each(["story", "task", "bug", "subtask"])("defaults %s to content", (type) => {
    expect(defaultTicketTab(type)).toBe("content");
  });
});

describe("resolveTicketTab", () => {
  it("returns a valid tab for the type as-is", () => {
    expect(resolveTicketTab("history", "story")).toBe("history");
    expect(resolveTicketTab("review", "story")).toBe("review");
    expect(resolveTicketTab("children", "epic")).toBe("children");
  });

  it("falls back to the default for an unknown tab value", () => {
    expect(resolveTicketTab("bogus", "story")).toBe("content");
    expect(resolveTicketTab("bogus", "epic")).toBe("children");
  });

  it("falls back when the tab exists but not for this ticket type", () => {
    expect(resolveTicketTab("development", "epic")).toBe("children");
    expect(resolveTicketTab("review", "subtask")).toBe("content");
    expect(resolveTicketTab("children", "story")).toBe("content");
  });

  it("falls back for null, undefined, and empty values", () => {
    expect(resolveTicketTab(null, "story")).toBe("content");
    expect(resolveTicketTab(undefined, "epic")).toBe("children");
    expect(resolveTicketTab("", "story")).toBe("content");
  });
});

describe("buildTicketDetailUrl", () => {
  it("builds a bare path when no params are set", () => {
    expect(buildTicketDetailUrl("VPL-100")).toBe("/tickets/VPL-100");
    expect(buildTicketDetailUrl("VPL-100", {})).toBe("/tickets/VPL-100");
  });

  it("includes the open child as ?ticket=", () => {
    expect(buildTicketDetailUrl("VPL-100", { ticket: "VPL-200" })).toBe(
      "/tickets/VPL-100?ticket=VPL-200",
    );
  });

  it("includes the tab as ?tab=", () => {
    expect(buildTicketDetailUrl("VPL-100", { tab: "history" })).toBe(
      "/tickets/VPL-100?tab=history",
    );
  });

  it("combines ticket and tab", () => {
    expect(buildTicketDetailUrl("VPL-100", { ticket: "VPL-200", tab: "history" })).toBe(
      "/tickets/VPL-100?ticket=VPL-200&tab=history",
    );
  });

  it("drops null and empty values", () => {
    expect(buildTicketDetailUrl("VPL-100", { ticket: null, tab: null })).toBe("/tickets/VPL-100");
    expect(buildTicketDetailUrl("VPL-100", { ticket: "", tab: "" })).toBe("/tickets/VPL-100");
  });

  it("encodes the route key", () => {
    expect(buildTicketDetailUrl("DRAFT-abc/def")).toBe("/tickets/DRAFT-abc%2Fdef");
  });
});
