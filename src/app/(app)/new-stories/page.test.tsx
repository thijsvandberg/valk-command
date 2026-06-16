import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NewStoriesPage from "./page";
import type { NewStoriesResponse } from "@/lib/new-stories-types";

// --- Mocks ---

let listData: NewStoriesResponse | undefined;
const listMutate = vi.fn();
const globalMutateSpy = vi.fn();

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (key === "/api/new-stories") {
      return { data: listData, isLoading: false, mutate: listMutate };
    }
    if (key === "/api/settings/user-teams") {
      return { data: { assignments: [] }, isLoading: false, mutate: vi.fn() };
    }
    return { data: undefined, isLoading: false, mutate: vi.fn() };
  },
  mutate: (...args: unknown[]) => globalMutateSpy(...args),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: () => null }));
vi.mock("@/hooks/useDefaultTeam", () => ({
  useDefaultTeam: () => ({ defaultTeam: null, setDefaultTeam: vi.fn(), isLoading: false }),
}));
vi.mock("@/hooks/useSprintBoard", () => ({ useTicketDetail: () => ({ data: null }) }));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({ saveTicketMetadata: vi.fn() }));
vi.mock("@/components/sprint-board/SidePanel", () => ({
  SidePanel: ({ ticket, onClose }: { ticket: { key: string }; onClose: () => void }) => (
    <div data-testid="side-panel">
      <span>panel:{ticket.key}</span>
      <button onClick={onClose}>close-panel</button>
    </div>
  ),
}));

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal("fetch", fetchMock);

function row(key: string, title: string) {
  return {
    key,
    title,
    type: "story" as const,
    epic: null,
    epicKey: null,
    storyPoints: null,
    assignee: null,
    reporter: { name: "Alice", initials: "A", color: "#000" },
    sprintName: null,
    jiraCreatedAt: new Date().toISOString(),
  };
}

describe("NewStoriesPage (BRDG-356)", () => {
  beforeEach(() => {
    listData = { rows: [row("VPL-1", "First story"), row("VPL-2", "Second story")] };
    listMutate.mockClear();
    globalMutateSpy.mockClear();
    fetchMock.mockClear();
  });

  it("renders the seven columns and a date group heading", () => {
    render(<NewStoriesPage />);
    for (const label of ["Title", "Author", "Sprint", "Epic", "SP", "Asgn", "Created"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("First story")).toBeInTheDocument();
    expect(screen.getByText("Second story")).toBeInTheDocument();
  });

  it("caps and centers the inbox content on wide screens (BRDG-361)", () => {
    const { container } = render(<NewStoriesPage />);
    const cap = container.querySelector(".max-w-\\[1536px\\]");
    expect(cap).toBeTruthy();
    // The capped wrapper holds the table content.
    expect(cap).toHaveTextContent("First story");
  });

  it("opens the side panel when a row title is clicked", async () => {
    render(<NewStoriesPage />);
    fireEvent.click(screen.getByText("First story"));
    // The panel is a lazy dynamic import, so it resolves on a later tick.
    const panel = await screen.findByTestId("side-panel");
    expect(panel).toHaveTextContent("panel:VPL-1");
  });

  it("marks a single story read via the row action (optimistic + undo)", async () => {
    render(<NewStoriesPage />);
    const markButtons = screen.getAllByRole("button", { name: "Mark as read" });
    fireEvent.click(markButtons[0]);

    // Optimistic list update attempted.
    expect(listMutate).toHaveBeenCalled();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/new-stories/read",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    // Undo toast appears and re-marks the story unread.
    const undo = await screen.findByText("Undo");
    fireEvent.click(undo);
    await waitFor(() => {
      const calledUnread = fetchMock.mock.calls.some(
        ([, opts]) => typeof opts?.body === "string" && opts.body.includes("\"read\":false"),
      );
      expect(calledUnread).toBe(true);
    });
  });

  it("bulk-marks selected stories read via the multi-select toolbar", async () => {
    render(<NewStoriesPage />);
    const selects = screen.getAllByRole("button", { name: "Select" });
    fireEvent.click(selects[0]);
    fireEvent.click(selects[1]);

    const bulkButton = await screen.findByRole("button", { name: /Mark 2 as read/ });
    fireEvent.click(bulkButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/new-stories/read",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(listMutate).toHaveBeenCalled();
  });
});
