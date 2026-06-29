import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StakeholderPage from "./page";

// --- Mocks ---

const SWR_DATA: Record<string, unknown> = {};

vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>();
  return {
    ...actual,
    default: vi.fn((key: string | null) => {
      if (!key) return { data: undefined, isLoading: false };
      const data = SWR_DATA[key] ?? undefined;
      return { data, isLoading: data === undefined };
    }),
  };
});

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: vi.fn(() => ({
    sprints: [
      { id: 10, name: "BM: 135", state: "active", startDate: "2026-04-01T00:00:00Z", endDate: "2026-04-14T00:00:00Z" },
      { id: 11, name: "BM: 136", state: "future", startDate: "2026-04-15T00:00:00Z", endDate: "2026-04-28T00:00:00Z" },
      { id: 20, name: "GXP: 135", state: "active", startDate: "2026-04-01T00:00:00Z", endDate: "2026-04-14T00:00:00Z" },
      { id: 21, name: "GXP: 136", state: "future", startDate: "2026-04-15T00:00:00Z", endDate: "2026-04-28T00:00:00Z" },
    ],
    backlogCount: 0,
  })),
}));

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => mockSearchParams),
  useRouter: vi.fn(() => ({ replace: mockReplace })),
}));

// --- Fixtures ---

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
  mockSearchParams = new URLSearchParams();
  mockReplace.mockClear();
  sessionStorage.clear();
  // ViewHeader portals into this element — create it so the portal renders in tests
  if (!document.getElementById("view-header-portal")) {
    const portal = document.createElement("div");
    portal.id = "view-header-portal";
    document.body.appendChild(portal);
  }
  Object.assign(SWR_DATA, {
    "/api/tickets?sprintId=10": MOCK_TICKETS,
    "/api/tickets?sprintId=11": [],
    "/api/tickets?sprintId=20": [],
    "/api/tickets?sprintId=21": [],
  });
});

// --- Tests ---

describe("StakeholderPage", () => {
  it("renders the active sprint name by default", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "BM: 135" })).toBeInTheDocument();
    });
  });

  it("sets URL params on first load (no existing params)", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("team=BM"));
    });
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("sprintId=10"));
  });

  it("renders team selector when multiple teams exist", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Team")).toBeInTheDocument();
    });
    const teamOptions = Array.from(screen.getByLabelText("Team").querySelectorAll("option"));
    const values = teamOptions.map((o) => o.textContent);
    expect(values).toContain("BM");
    expect(values).toContain("GXP");
  });

  it("renders sprint selector dropdown with team sprints", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Sprint")).toBeInTheDocument();
    });
    const sprintOptions = Array.from(screen.getByLabelText("Sprint").querySelectorAll("option"));
    const names = sprintOptions.map((o) => o.textContent);
    // BM team sprints only
    expect(names.some((n) => n?.includes("BM: 135"))).toBe(true);
    expect(names.some((n) => n?.includes("BM: 136"))).toBe(true);
    expect(names.every((n) => !n?.includes("GXP"))).toBe(true);
  });

  it("renders correct sprint when URL params are preset", async () => {
    mockSearchParams = new URLSearchParams("team=GXP&sprintId=20");
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GXP: 135" })).toBeInTheDocument();
    });
  });

  it("switching team calls router.replace with new team URL", async () => {
    render(<StakeholderPage />);
    await waitFor(() => expect(screen.getByLabelText("Team")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "GXP" } });

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("team=GXP"));
  });

  it("renders prev/next navigation buttons", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /previous sprint/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /next sprint/i })).toBeInTheDocument();
    });
  });

  it("renders ticket titles in the overview", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText("Build login page")).toBeInTheDocument();
      expect(screen.getByText("Setup CI pipeline")).toBeInTheDocument();
      expect(screen.getByText("Write documentation")).toBeInTheDocument();
    });
  });

  it("shows human-readable status sections, not raw Jira statuses", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
      expect(screen.getByText("To Do")).toBeInTheDocument();
    });
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

  it("shows assignee initials avatar in the in-progress section", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      // Assignee is now shown as an initials avatar; check by title attribute
      expect(screen.getByTitle("Bob Jones")).toBeInTheDocument();
    });
  });

  it("renders the copy button inside the more options dropdown", async () => {
    render(<StakeholderPage />);
    // The copy button lives inside the "More options" dropdown — open it first
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /copy as markdown/i })).toBeInTheDocument();
    });
  });

  it("renders last updated footer", async () => {
    render(<StakeholderPage />);
    await waitFor(() => {
      expect(screen.getByText(/last updated/i)).toBeInTheDocument();
    });
  });
});
