import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InboxPage from "./page";
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
    // Settings + assignable-user lookups: untouched defaults.
    return { data: undefined, isLoading: false, mutate: vi.fn() };
  },
  mutate: (...args: unknown[]) => globalMutateSpy(...args),
}));

vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: () => null }));
vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: () => ({ data: null }),
  // Row-action hook (BRDG-373) inputs; sprints empty is fine for the wiring tests.
  useJiraSprints: () => ({ sprints: [], mutate: vi.fn() }),
  useSprintSlots: () => ({ data: [] }),
}));
vi.mock("@/hooks/useBacklogDropTarget", () => ({ useBacklogDropTarget: () => ({ backlogTargetName: "BT: Backlog" }) }));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  saveTicketMetadata: vi.fn(),
  mapJiraSprints: () => [],
  bulkReviewStories: vi.fn(),
  bulkGenerateSubtasks: vi.fn(),
}));
// The modals are not under test here; the hook test covers the quick-create flow.
vi.mock("@/components/refinement-session/AddToRefinementModal", () => ({ AddToRefinementModal: () => null }));
vi.mock("@/components/sprint-board/CreateSprintModal", () => ({ CreateSprintModal: () => null }));
vi.mock("@/components/sprint-board/SidePanel", () => ({
  SidePanel: ({ ticket, onClose }: { ticket: { key: string }; onClose: () => void }) => (
    <div data-testid="side-panel">
      <span>panel:{ticket.key}</span>
      <button onClick={onClose}>close-panel</button>
    </div>
  ),
}));

// Controls cluster pulls SWR/filter UI; the inbox filter logic is covered by
// useInboxFilters.test. Stub it so the page test stays focused on row + bulk wiring.
vi.mock("@/components/sprint-board/UnifiedControlsCluster", () => ({
  UnifiedControlsCluster: () => <div data-testid="controls" />,
}));

// BoardRow's pill + actions are covered by BoardRow.test.tsx. The stub proves the
// page feeds BoardRow (key rendered as a pill, not plain text) and wires its
// callbacks + the inbox visibleTags.
vi.mock("@/components/sprint-board/BoardRow", () => ({
  BoardRow: ({
    ticket,
    tags,
    onMarkRead,
    onCheckboxClick,
    onSelectTicket,
    onRowContextMenu,
  }: {
    ticket: { key: string; title: string };
    tags?: Set<string>;
    onMarkRead?: (key: string) => void;
    onCheckboxClick: (key: string) => void;
    onSelectTicket: (key: string) => void;
    onRowContextMenu?: (key: string, e: React.MouseEvent) => void;
  }) => (
    <tr>
      <td>
        <button aria-label="Select" onClick={() => onCheckboxClick(ticket.key)} />
        <button onClick={() => onSelectTicket(ticket.key)}>
          <span data-testid="pill">{ticket.key}</span>
          <span>{ticket.title}</span>
        </button>
        {onMarkRead && <button aria-label="Mark as read" onClick={() => onMarkRead(ticket.key)} />}
        {onRowContextMenu && (
          <button
            aria-label={`ctx-${ticket.key}`}
            onClick={() => onRowContextMenu(ticket.key, { clientX: 5, clientY: 5 } as React.MouseEvent)}
          />
        )}
        <span data-testid={`tags-${ticket.key}`}>{[...(tags ?? [])].join(",")}</span>
      </td>
    </tr>
  ),
}));

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal("fetch", fetchMock);

// Deterministic "today" timestamps that strictly decrease per call, so the
// inbox's default created-desc sort keeps rows in call order (VPL-1 before
// VPL-2) regardless of real-clock millisecond ties under load.
let rowSeq = 0;
function row(key: string, title: string) {
  const createdAt = new Date(Date.now() - rowSeq++ * 1000).toISOString();
  return {
    key,
    title,
    type: "story" as const,
    jiraStatus: "TO DO" as const,
    epic: null,
    epicKey: null,
    storyPoints: null,
    assignee: null,
    reporter: { name: "Alice", initials: "A", color: "#000" },
    sprintName: null,
    jiraCreatedAt: createdAt,
  };
}

describe("InboxPage (BRDG-357)", () => {
  beforeEach(() => {
    listData = { rows: [row("VPL-1", "First story"), row("VPL-2", "Second story")] };
    listMutate.mockClear();
    globalMutateSpy.mockClear();
    fetchMock.mockClear();
  });

  it("renders rows through BoardRow with the inbox default tags (key is a pill)", () => {
    render(<InboxPage />);
    const pills = screen.getAllByTestId("pill");
    expect(pills.map((p) => p.textContent)).toEqual(["VPL-1", "VPL-2"]);
    expect(screen.getByText("First story")).toBeInTheDocument();
    // Default inbox display tags: Epic, SP, Assignee.
    expect(screen.getByTestId("tags-VPL-1")).toHaveTextContent("epic");
    expect(screen.getByTestId("tags-VPL-1")).toHaveTextContent("storyPoints");
    expect(screen.getByTestId("tags-VPL-1")).toHaveTextContent("assignee");
  });

  it("caps and centers the inbox content on wide screens (BRDG-361)", () => {
    const { container } = render(<InboxPage />);
    const cap = container.querySelector(".max-w-\\[1536px\\]");
    expect(cap).toBeTruthy();
  });

  it("opens the side panel when a row is clicked", async () => {
    render(<InboxPage />);
    fireEvent.click(screen.getByText("First story"));
    const panel = await screen.findByTestId("side-panel");
    expect(panel).toHaveTextContent("panel:VPL-1");
  });

  it("marks a single story read via the row action (optimistic + undo)", async () => {
    render(<InboxPage />);
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
    render(<InboxPage />);
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

  it("right-clicking a row opens the shared action menu with the move + edit actions (BRDG-373 AC #1)", async () => {
    render(<InboxPage />);
    fireEvent.click(screen.getByRole("button", { name: "ctx-VPL-1" }));

    // The real TicketActionMenuContent renders at the cursor with the board's items.
    expect(await screen.findByText("Move to Sprint")).toBeInTheDocument();
    expect(screen.getByText("Set Status")).toBeInTheDocument();
    expect(screen.getByText("Add to Refinement")).toBeInTheDocument();
  });

  it("the multi-select bar reuses the board actions alongside Mark as read (BRDG-373 AC #4)", () => {
    render(<InboxPage />);
    const selects = screen.getAllByRole("button", { name: "Select" });
    fireEvent.click(selects[0]);
    fireEvent.click(selects[1]);

    expect(screen.getByRole("button", { name: /Mark 2 as read/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Update/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AI Assist/ })).toBeInTheDocument();
  });
});

describe("InboxPage group select-all (BRDG-358)", () => {
  beforeEach(() => {
    // Both rows created "now" land in a single Today group under the default date grouping.
    listData = { rows: [row("VPL-1", "First story"), row("VPL-2", "Second story")] };
    listMutate.mockClear();
    globalMutateSpy.mockClear();
    fetchMock.mockClear();
    sessionStorage.clear();
  });

  it("group header select-all selects exactly that group's rows and feeds the bulk action", async () => {
    render(<InboxPage />);
    const groupSelectAll = screen.getByRole("checkbox", { name: "Select all items in this group" });
    expect(groupSelectAll).toHaveAttribute("aria-checked", "false");

    fireEvent.click(groupSelectAll);

    // Both rows in the group are now selected; the bulk bar reflects the count.
    expect(await screen.findByRole("button", { name: /Mark 2 as read/ })).toBeInTheDocument();
    expect(groupSelectAll).toHaveAttribute("aria-checked", "true");
  });

  it("renders an indeterminate header when only some of the group is selected", async () => {
    render(<InboxPage />);
    const groupSelectAll = screen.getByRole("checkbox", { name: "Select all items in this group" });
    fireEvent.click(groupSelectAll); // select all
    fireEvent.click(screen.getAllByRole("button", { name: "Select" })[0]); // deselect one row

    await waitFor(() => expect(groupSelectAll).toHaveAttribute("aria-checked", "mixed"));
    expect(screen.getByRole("button", { name: /Mark 1 as read/ })).toBeInTheDocument();
  });
});
