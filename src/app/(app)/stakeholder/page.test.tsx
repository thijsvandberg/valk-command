import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StakeholderPage from "./page";

// SWR mock: keyed by URL pattern
const SWR_DATA: Record<string, unknown> = {};

vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>();
  return {
    ...actual,
    default: vi.fn((key: string | null) => {
      if (!key) return { data: undefined, isLoading: false };
      const data = SWR_DATA[key] ?? undefined;
      if (data !== undefined) {
        // Simulate onSuccess callback for the tickets key
        return { data, isLoading: false };
      }
      return { data: undefined, isLoading: true };
    }),
  };
});

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: vi.fn(() => ({
    data: [
      { id: 10, name: "Sprint 10", state: "active", startDate: "2026-04-01T00:00:00Z", endDate: "2026-04-14T00:00:00Z" },
      { id: 11, name: "Sprint 11", state: "future", startDate: "2026-04-15T00:00:00Z", endDate: "2026-04-28T00:00:00Z" },
    ],
  })),
}));

const MOCK_TICKETS = [
  {
    key: "VPL-1",
    title: "Build login page",
    type: "story",
    epic: "Core Platform",
    epicKey: "VPL-100",
    jiraStatus: "DONE",
    storyPoints: 5,
    assignee: { name: "Alice Smith", initials: "AS", color: "#abc" },
    flagged: false,
    poStatus: "Ready",
    qualityScore: 90,
    editState: "clean",
    notes: "internal note",
    jiraRank: 1,
    sprintId: "10",
    jiraUpdatedAt: null,
    removedFromJiraAt: null,
  },
  {
    key: "VPL-2",
    title: "Setup CI pipeline",
    type: "task",
    epic: "DevOps",
    epicKey: "VPL-101",
    jiraStatus: "IN PROGRESS",
    storyPoints: 3,
    assignee: { name: "Bob Jones", initials: "BJ", color: "#def" },
    flagged: false,
    poStatus: null,
    qualityScore: null,
    editState: "clean",
    notes: "",
    jiraRank: 2,
    sprintId: "10",
    jiraUpdatedAt: null,
    removedFromJiraAt: null,
  },
  {
    key: "VPL-3",
    title: "Write documentation",
    type: "task",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: 2,
    assignee: null,
    flagged: false,
    poStatus: null,
    qualityScore: null,
    editState: "clean",
    notes: "",
    jiraRank: 3,
    sprintId: "10",
    jiraUpdatedAt: null,
    removedFromJiraAt: null,
  },
];

beforeEach(() => {
  Object.assign(SWR_DATA, {
    "/api/tickets?sprintId=10": MOCK_TICKETS,
    "/api/tickets?sprintId=11": [],
  });
});

describe("StakeholderPage", () => {
  it("renders the sprint name", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sprint 10");
    });
  });

  it("renders sprint selector with both sprints", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
    });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Sprint 10");
    expect(options[1]).toHaveTextContent("Sprint 11");
  });

  it("renders ticket titles in the overview", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText("Build login page")).toBeInTheDocument();
      expect(screen.getByText("Setup CI pipeline")).toBeInTheDocument();
      expect(screen.getByText("Write documentation")).toBeInTheDocument();
    });
  });

  it("shows human-readable status sections, not Jira statuses", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("To Do")).toBeInTheDocument();
    });
    // Raw Jira status strings should not appear
    expect(screen.queryByText("DONE")).toBeNull();
    expect(screen.queryByText("IN PROGRESS")).toBeNull();
    expect(screen.queryByText("TO DO")).toBeNull();
  });

  it("does not render PO-internal fields", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText("Build login page")).toBeInTheDocument();
    });
    expect(screen.queryByText("VPL-1")).toBeNull();
    expect(screen.queryByText("VPL-2")).toBeNull();
    expect(screen.queryByText("90")).toBeNull();
    expect(screen.queryByText("internal note")).toBeNull();
  });

  it("shows assignee name in in-progress section", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  it("renders the copy button", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy.*markdown/i })).toBeInTheDocument();
    });
  });

  it("renders last updated footer", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText(/last updated/i)).toBeInTheDocument();
    });
  });
});
