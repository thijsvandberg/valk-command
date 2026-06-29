import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InboxPage from "./page";
import type { NewStoriesResponse } from "@/lib/new-stories-types";

// --- Mocks ---

let listData: NewStoriesResponse | undefined;
let listError: Error | undefined;
const listMutate = vi.fn();
const globalMutateSpy = vi.fn();

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (key === "/api/new-stories") {
      return { data: listData, isLoading: false, error: listError, mutate: listMutate };
    }
    // Settings + assignable-user lookups: untouched defaults.
    return { data: undefined, isLoading: false, mutate: vi.fn() };
  },
  mutate: (...args: unknown[]) => globalMutateSpy(...args),
}));

// Inbox reads ?new=1 (digest deep-link, BRDG-438) via useSearchParams; drive it per test.
let searchParamsMock = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
  useRouter: () => ({ push: vi.fn() }),
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
    // Future baseline => no rows are "new", so the default fixtures behave exactly
    // as before (no "N new" chip). New-filter tests below set their own baseline.
    listData = { rows: [row("VPL-1", "First story"), row("VPL-2", "Second story")], baselineAt: "2099-01-01T00:00:00.000Z" };
    searchParamsMock = new URLSearchParams();
    listError = undefined;
    listMutate.mockClear();
    globalMutateSpy.mockClear();
    fetchMock.mockClear();
  });

  it("surfaces a fetch failure with a retry affordance instead of a blank inbox (BRDG-423)", () => {
    listData = undefined;
    listError = new Error("Inbox feed is down");
    render(<InboxPage />);
    expect(screen.getByText("Inbox feed is down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(listMutate).toHaveBeenCalled();
  });

  it("shows the shared empty state when there are no stories (BRDG-423)", () => {
    listData = { rows: [], baselineAt: null };
    render(<InboxPage />);
    expect(screen.getByText("Inbox zero")).toBeInTheDocument();
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

    // The real TicketActionMenuContent renders at the cursor with the board's grouped
    // items (Move inline, Update nested) plus the inbox-only "Mark as read" option.
    expect(await screen.findByText("Move to other sprint…")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByText("Add to refinement")).toBeInTheDocument();
    expect(screen.getByText("Mark as read")).toBeInTheDocument();
  });

  it("marks a story read from the right-click menu (BRDG-373)", async () => {
    render(<InboxPage />);
    fireEvent.click(screen.getByRole("button", { name: "ctx-VPL-1" }));
    fireEvent.click(await screen.findByText("Mark as read"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/new-stories/read",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("the multi-select bar reuses the board actions alongside Mark as read (BRDG-373 AC #4)", () => {
    render(<InboxPage />);
    const selects = screen.getAllByRole("button", { name: "Select" });
    fireEvent.click(selects[0]);
    fireEvent.click(selects[1]);

    expect(screen.getByRole("button", { name: /Mark 2 as read/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assist" })).toBeInTheDocument();
  });
});

describe("InboxPage group select-all (BRDG-358)", () => {
  beforeEach(() => {
    // Both rows created "now" land in a single Today group under the default date grouping.
    // Future baseline => no rows are "new", so the default fixtures behave exactly
    // as before (no "N new" chip). New-filter tests below set their own baseline.
    listData = { rows: [row("VPL-1", "First story"), row("VPL-2", "Second story")], baselineAt: "2099-01-01T00:00:00.000Z" };
    searchParamsMock = new URLSearchParams();
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

describe("InboxPage new-only filter (BRDG-438)", () => {
  // One row created after the baseline (new) and one before (not new).
  const NEW_KEY = "VPL-NEW";
  const OLD_KEY = "VPL-OLD";
  function mixedRows() {
    return [
      { ...row(NEW_KEY, "New story"), jiraCreatedAt: "2026-06-25T00:00:00.000Z" },
      { ...row(OLD_KEY, "Old story"), jiraCreatedAt: "2026-06-10T00:00:00.000Z" },
    ];
  }
  const BASELINE = "2026-06-20T00:00:00.000Z"; // between the two -> exactly one new

  beforeEach(() => {
    listData = { rows: mixedRows(), baselineAt: BASELINE };
    searchParamsMock = new URLSearchParams();
    listMutate.mockClear();
    globalMutateSpy.mockClear();
    fetchMock.mockClear();
    sessionStorage.clear();
    // ViewHeader (which hosts the count chip) renders through a portal into
    // #view-header-portal; provide the target so the header is in the DOM.
    if (!document.getElementById("view-header-portal")) {
      const portal = document.createElement("div");
      portal.id = "view-header-portal";
      document.body.appendChild(portal);
    }
  });

  it("shows a 'N new' chip with the count of rows newer than the baseline", () => {
    render(<InboxPage />);
    expect(screen.getByRole("button", { name: /1 new/ })).toBeInTheDocument();
    // Both rows visible until the chip is clicked.
    expect(screen.getByText("New story")).toBeInTheDocument();
    expect(screen.getByText("Old story")).toBeInTheDocument();
  });

  it("hides the chip when nothing is new (future baseline)", () => {
    listData = { rows: mixedRows(), baselineAt: "2099-01-01T00:00:00.000Z" };
    render(<InboxPage />);
    expect(screen.queryByRole("button", { name: /new$/ })).toBeNull();
  });

  it("clicking the chip filters to only new rows; clicking the total restores all", () => {
    render(<InboxPage />);
    fireEvent.click(screen.getByRole("button", { name: /1 new/ }));
    expect(screen.getByText("New story")).toBeInTheDocument();
    expect(screen.queryByText("Old story")).toBeNull();

    fireEvent.click(screen.getByTitle("Show all unread"));
    expect(screen.getByText("Old story")).toBeInTheDocument();
  });

  it("initialises in new-only mode from the digest deep-link ?new=1", () => {
    searchParamsMock = new URLSearchParams("new=1");
    render(<InboxPage />);
    expect(screen.getByText("New story")).toBeInTheDocument();
    expect(screen.queryByText("Old story")).toBeNull();
  });

  it("select-all over the new-filtered list selects exactly the new rows", async () => {
    searchParamsMock = new URLSearchParams("new=1");
    render(<InboxPage />);
    // Only the new row is in the group, so selecting all yields a single mark-read target.
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all items in this group" }));
    expect(await screen.findByRole("button", { name: /Mark 1 as read/ })).toBeInTheDocument();
  });
});
