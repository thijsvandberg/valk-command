import { describe, it, expect } from "vitest";
import { filterTickets } from "./RefinementPageContent";
import type { Ticket } from "@/types/ticket";

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "TEST-1",
    title: "Test ticket",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    ...overrides,
  };
}

const defaultOpts = {
  sprintFilter: new Set<string>(),
  hideEstimated: false,
  epicFilter: new Set<string>(),
  lastUpdatedFilter: "all",
};

describe("filterTickets", () => {
  describe("sprint filter", () => {
    it("passes all tickets when sprint filter is empty", () => {
      const tickets = [
        makeTicket({ key: "A-1", sprintId: "s1" }),
        makeTicket({ key: "A-2" }),
      ];
      const result = filterTickets(tickets, defaultOpts);
      expect(result).toHaveLength(2);
    });

    it("filters to matching sprint only", () => {
      const tickets = [
        makeTicket({ key: "A-1", sprintId: "s1" }),
        makeTicket({ key: "A-2", sprintId: "s2" }),
        makeTicket({ key: "A-3" }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        sprintFilter: new Set(["s1"]),
      });
      expect(result.map((t) => t.key)).toEqual(["A-1"]);
    });
  });

  describe("hide estimated", () => {
    it("hides tickets with story points > 0 when enabled", () => {
      const tickets = [
        makeTicket({ key: "A-1", storyPoints: 5 }),
        makeTicket({ key: "A-2", storyPoints: null }),
        makeTicket({ key: "A-3", storyPoints: 0 }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        hideEstimated: true,
      });
      expect(result.map((t) => t.key)).toEqual(["A-2", "A-3"]);
    });

    it("shows all tickets when disabled", () => {
      const tickets = [
        makeTicket({ key: "A-1", storyPoints: 5 }),
        makeTicket({ key: "A-2", storyPoints: null }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        hideEstimated: false,
      });
      expect(result).toHaveLength(2);
    });
  });

  describe("epic filter", () => {
    it("filters to selected epics only", () => {
      const tickets = [
        makeTicket({ key: "A-1", epic: "Auth" }),
        makeTicket({ key: "A-2", epic: "Billing" }),
        makeTicket({ key: "A-3", epic: null }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        epicFilter: new Set(["Auth"]),
      });
      expect(result.map((t) => t.key)).toEqual(["A-1"]);
    });

    it("passes all tickets when epic filter is empty (all epics)", () => {
      const tickets = [
        makeTicket({ key: "A-1", epic: "Auth" }),
        makeTicket({ key: "A-2", epic: null }),
      ];
      const result = filterTickets(tickets, defaultOpts);
      expect(result).toHaveLength(2);
    });

    it("supports multi-select epics", () => {
      const tickets = [
        makeTicket({ key: "A-1", epic: "Auth" }),
        makeTicket({ key: "A-2", epic: "Billing" }),
        makeTicket({ key: "A-3", epic: "Reports" }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        epicFilter: new Set(["Auth", "Reports"]),
      });
      expect(result.map((t) => t.key)).toEqual(["A-1", "A-3"]);
    });
  });

  describe("last updated filter", () => {
    it("hides tickets older than threshold", () => {
      const now = Date.now();
      const tickets = [
        makeTicket({ key: "A-1", jiraUpdatedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString() }),
        makeTicket({ key: "A-2", jiraUpdatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        lastUpdatedFilter: "1w",
      });
      expect(result.map((t) => t.key)).toEqual(["A-1"]);
    });

    it("hides tickets with null jiraUpdatedAt when filter is active", () => {
      const tickets = [
        makeTicket({ key: "A-1", jiraUpdatedAt: null }),
        makeTicket({ key: "A-2", jiraUpdatedAt: new Date().toISOString() }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        lastUpdatedFilter: "4w",
      });
      expect(result.map((t) => t.key)).toEqual(["A-2"]);
    });

    it("shows all tickets when set to 'all'", () => {
      const tickets = [
        makeTicket({ key: "A-1", jiraUpdatedAt: "2020-01-01T00:00:00Z" }),
        makeTicket({ key: "A-2", jiraUpdatedAt: null }),
      ];
      const result = filterTickets(tickets, {
        ...defaultOpts,
        lastUpdatedFilter: "all",
      });
      expect(result).toHaveLength(2);
    });
  });

  describe("combined filters", () => {
    it("applies all filters together", () => {
      const now = Date.now();
      const tickets = [
        makeTicket({
          key: "A-1",
          sprintId: "s1",
          storyPoints: null,
          epic: "Auth",
          jiraUpdatedAt: new Date(now - 1000).toISOString(),
        }),
        makeTicket({
          key: "A-2",
          sprintId: "s1",
          storyPoints: 5,
          epic: "Auth",
          jiraUpdatedAt: new Date(now - 1000).toISOString(),
        }),
        makeTicket({
          key: "A-3",
          sprintId: "s2",
          storyPoints: null,
          epic: "Auth",
          jiraUpdatedAt: new Date(now - 1000).toISOString(),
        }),
      ];
      const result = filterTickets(tickets, {
        sprintFilter: new Set(["s1"]),
        hideEstimated: true,
        epicFilter: new Set(["Auth"]),
        lastUpdatedFilter: "1w",
      });
      expect(result.map((t) => t.key)).toEqual(["A-1"]);
    });
  });
});
