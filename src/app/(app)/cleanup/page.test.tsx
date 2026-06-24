import type { ReactNode } from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CleanupPage from "./page";
import type { CleanupResponse } from "@/lib/cleanup-types";

// --- Mocks ---

let swrData: CleanupResponse | undefined;
let swrLoading = false;
const swrSpy = vi.fn();

vi.mock("swr", () => ({
  default: (key: string | null) => {
    swrSpy(key);
    return { data: swrData, isLoading: swrLoading, mutate: vi.fn() };
  },
  mutate: vi.fn(),
}));

// The panel is a heavy dynamic import; stub it so the test asserts wiring
// (which ticket key it opens) without rendering the full ticket detail tree.
vi.mock("@/components/sprint-board/SidePanel", () => ({
  SidePanel: ({ ticket, onClose }: { ticket: { key: string }; onClose: () => void }) => (
    <div data-testid="side-panel">
      <span>panel:{ticket.key}</span>
      <button onClick={onClose}>close-panel</button>
    </div>
  ),
}));

// The breakdown/disposition drawer (BRDG-289) is also a dynamic import; stub it
// so the test asserts which ticket the row click opens, and lets it escalate to
// the full SidePanel.
vi.mock("./DispositionPanel", () => ({
  DispositionPanel: ({
    jiraKey,
    onOpenTicket,
    onClose,
  }: {
    jiraKey: string;
    onOpenTicket: (k: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="disposition-panel">
      <span>review:{jiraKey}</span>
      <button onClick={() => onOpenTicket(jiraKey)}>open-ticket</button>
      <button onClick={onClose}>close-review</button>
    </div>
  ),
}));

// The cleanup list now renders through the shared sprint-board BoardRow (BRDG-389),
// which draws the TicketStatusPill. Stub it so the test asserts the wiring contract —
// the ticket it receives, its checkbox/selection callbacks, and the trailing badges
// supplied in metadataSlot — without mounting the full board pill tree. BoardRow is a
// table row, so the stub renders a <tr> to keep the surrounding <table> valid.
vi.mock("@/components/sprint-board/BoardRow", () => ({
  BoardRow: ({
    ticket,
    ticketIdx,
    isChecked,
    onSelectTicket,
    onCheckboxClick,
    metadataSlot,
  }: {
    ticket: { key: string; title: string; type: string };
    ticketIdx: number;
    isChecked: boolean;
    onSelectTicket?: (key: string | null) => void;
    onCheckboxClick?: (key: string, idx: number, shiftKey: boolean) => void;
    metadataSlot?: ReactNode;
  }) => (
    <tr data-testid={`row-${ticket.key}`} data-type={ticket.type}>
      <td>
        <button data-testid={`open-${ticket.key}`} onClick={() => onSelectTicket?.(ticket.key)}>
          {ticket.key} {ticket.title}
        </button>
        <button
          data-testid={`check-${ticket.key}`}
          aria-pressed={isChecked}
          onClick={() => onCheckboxClick?.(ticket.key, ticketIdx, false)}
        >
          select
        </button>
        <div data-testid={`meta-${ticket.key}`}>{metadataSlot}</div>
      </td>
    </tr>
  ),
}));

// EpicBadge consumes a reactive epic-color hook; stub it to a plain colour so the
// page test does not need the EpicColorProvider context.
vi.mock("@/hooks/useEpicColor", () => ({
  useEpicColor: () => ({ bg: "#222", text: "#abc" }),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: () => ({ data: undefined }),
}));

vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  saveTicketMetadata: vi.fn(),
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: () => null,
}));

// Default field set shared by all fixture rows; per-row overrides spread on top so
// each test row only states what it cares about.
const ROW_DEFAULTS = {
  type: "story" as const,
  epic: null,
  epicKey: null,
  storyPoints: null,
  sprintName: null,
  openSubtaskCount: 0,
  totalSubtaskCount: 0,
  epicChildCount: 0,
  assignee: null,
  reporter: null,
  jiraUpdatedAt: null,
  lastDeepScannedAt: null,
  scanRationale: null,
};

const EMPTY_FACETS = { types: [], epics: [], assignees: [], reporters: [], sprints: [] };

const RESPONSE: CleanupResponse = {
  total: 3,
  topics: [
    { key: "staleness", label: "Staleness", live: true },
    { key: "replaced", label: "Replaced area", live: false },
  ],
  facets: {
    types: ["story", "bug"],
    epics: [{ key: "BT-100", name: "Upsell" }],
    assignees: ["Alice"],
    reporters: ["Carol"],
    sprints: ["__backlog__"],
  },
  rows: [
    {
      ...ROW_DEFAULTS,
      key: "BT-1",
      title: "Ancient ticket",
      status: "TO DO",
      type: "bug",
      epic: "Upsell",
      epicKey: "BT-100",
      storyPoints: 3,
      assignee: { name: "Alice", initials: "AL", color: "hsl(1, 50%, 50%)" },
      lastScannedAt: "2026-06-01T00:00:00Z",
      lastDeepScannedAt: "2026-06-01T00:00:00Z",
      scanRationale: "Superseded by the new onboarding flow; no recent activity.",
      topicScores: { staleness: 0.82 },
      scanOverall: 0.82,
      disposition: "candidate",
      revivalScore: null,
      revivalRationale: null,
    },
    {
      ...ROW_DEFAULTS,
      key: "BT-2",
      title: "Fresh-ish ticket",
      status: "TO DO",
      lastScannedAt: null,
      topicScores: {},
      scanOverall: null,
      disposition: null,
      revivalScore: null,
      revivalRationale: null,
    },
    {
      ...ROW_DEFAULTS,
      key: "BT-3",
      title: "Worth pulling up",
      status: "TO DO",
      lastScannedAt: "2026-06-02T00:00:00Z",
      topicScores: {},
      scanOverall: 0.2,
      disposition: null,
      revivalScore: 0.78,
      revivalRationale: "Complements active payments work",
    },
  ],
};

describe("CleanupPage", () => {
  beforeEach(() => {
    swrData = undefined;
    swrLoading = false;
    swrSpy.mockClear();
  });

  it("shows the never-scanned empty state when there is no data", () => {
    swrData = { total: 0, topics: RESPONSE.topics, rows: [], facets: EMPTY_FACETS };
    render(<CleanupPage />);
    expect(screen.getByText("Nothing scanned yet")).toBeInTheDocument();
    expect(screen.getByText(/Tier-1 staleness runs in the background/i)).toBeInTheDocument();
  });

  it("renders one standard row per ticket via BoardRow", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    expect(screen.getByTestId("row-BT-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-BT-2")).toBeInTheDocument();
    expect(screen.getByTestId("row-BT-3")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-BT-1")).getByText(/Ancient ticket/)).toBeInTheDocument();
  });

  it("caps and centers the controls and list content on wide screens (BRDG-361)", () => {
    swrData = RESPONSE;
    const { container } = render(<CleanupPage />);
    // Controls block + list content + bulk-bar inner all share the same cap class.
    const caps = container.querySelectorAll(".max-w-\\[1536px\\]");
    expect(caps.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the scan rationale inline for rows that have one, and omits it otherwise", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    // BT-1 has a rationale -> rendered as a compact secondary line.
    expect(screen.getByText(/Superseded by the new onboarding flow/)).toBeInTheDocument();
    // BT-2 has no rationale -> no rationale line for it (clean, tight row).
    expect(screen.queryByText(/Superseded by the new onboarding flow.*BT-2/)).not.toBeInTheDocument();
    // Exactly one rationale line across the three fixture rows.
    expect(screen.getAllByText(/Superseded by the new onboarding flow/)).toHaveLength(1);
  });

  it("shows a deprecation-score badge from the overall score in the row metadata", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    // BT-1 has a 0.82 overall; the compact badge renders that value on the row.
    expect(within(screen.getByTestId("meta-BT-1")).getByText("0.82")).toBeInTheDocument();
    // Candidate disposition badge renders on the row ("Candidate" is also a
    // dropdown option, so scope to the row metadata).
    expect(within(screen.getByTestId("meta-BT-1")).getByText("Candidate")).toBeInTheDocument();
    // Never-scanned ticket shows "never" in its metadata.
    expect(within(screen.getByTestId("meta-BT-2")).getByText("never")).toBeInTheDocument();
  });

  it("feeds the real issue type to the row (the BoardRow list pill always shows its type icon)", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    const row = screen.getByTestId("row-BT-1");
    // BT-1 is a bug in the fixture; the row must receive that real type (PO #1). The
    // leading type icon is intrinsic to BoardRow's list pill (no showTypeIcon toggle).
    expect(row).toHaveAttribute("data-type", "bug");
  });

  it("renders epic and story-point badges in the row metadata", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    const meta = screen.getByTestId("meta-BT-1");
    // Epic name chip (PO #5).
    expect(within(meta).getByText("Upsell")).toBeInTheDocument();
    // Story points chip (3 SP on BT-1).
    expect(within(meta).getByText("3")).toBeInTheDocument();
  });

  it("shows a Backlog indicator on rows with no sprint", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    // Every fixture row is backlog (sprintName null) -> a Backlog chip per row.
    expect(within(screen.getByTestId("meta-BT-1")).getByText("Backlog")).toBeInTheDocument();
  });

  it("shows the epic child-story count for epic rows and the subtask count for others", () => {
    swrData = {
      ...RESPONSE,
      total: 2,
      rows: [
        {
          ...ROW_DEFAULTS,
          key: "EPIC-1",
          title: "An epic",
          status: "TO DO",
          type: "epic",
          epicChildCount: 9,
          lastScannedAt: null,
          topicScores: {},
          scanOverall: null,
          disposition: null,
          revivalScore: null,
          revivalRationale: null,
        },
        {
          ...ROW_DEFAULTS,
          key: "STORY-1",
          title: "A story with subtasks",
          status: "TO DO",
          type: "story",
          openSubtaskCount: 1,
          totalSubtaskCount: 4,
          epicChildCount: 0,
          lastScannedAt: null,
          topicScores: {},
          scanOverall: null,
          disposition: null,
          revivalScore: null,
          revivalRationale: null,
        },
      ],
    };
    render(<CleanupPage />);
    // Epic row: "N stories" count badge, no subtask badge.
    const epicMeta = screen.getByTestId("meta-EPIC-1");
    expect(within(epicMeta).getByText("9")).toBeInTheDocument();
    expect(within(epicMeta).queryByText("1/4")).not.toBeInTheDocument();
    // Non-epic row: subtask count badge, no epic child-count.
    const storyMeta = screen.getByTestId("meta-STORY-1");
    expect(within(storyMeta).getByText("1/4")).toBeInTheDocument();
  });

  it("renders the new facet filter controls", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    // The standard FilterDropdown triggers expose their label text (PO #2/#3).
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Epic")).toBeInTheDocument();
    expect(screen.getByText("Assignee")).toBeInTheDocument();
    expect(screen.getByText("Reporter")).toBeInTheDocument();
    expect(screen.getByText("Last activity")).toBeInTheDocument();
    expect(screen.getByText("Sprint")).toBeInTheDocument();
  });

  it("shows the restyled selection bar with a select-all toggle and clear", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    fireEvent.click(screen.getByTestId("check-BT-1"));
    // Counter now reads "N/total selected" (matches the sprint board bulk bar).
    expect(screen.getByText("1/3 selected")).toBeInTheDocument();
    // Select-all toggle selects every visible row.
    fireEvent.click(screen.getByRole("button", { name: /Select all visible/i }));
    expect(screen.getByText("3/3 selected")).toBeInTheDocument();
    // Deselect-all clears the bar entirely.
    fireEvent.click(screen.getByRole("button", { name: /Deselect all/i }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("shows a revival badge only on rows at/above the 0.6 threshold", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    // BT-3 has revivalScore 0.78 -> revival badge with its score.
    expect(within(screen.getByTestId("meta-BT-3")).getByText("0.78")).toBeInTheDocument();
    // BT-1 (no revival score) shows no 0.78-style revival chip; its only score is
    // the deprecation 0.82 badge.
    expect(within(screen.getByTestId("meta-BT-1")).queryByText("0.78")).not.toBeInTheDocument();
  });

  it("filters to revival candidates when the revival filter is toggled", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    // All three rows visible by default.
    expect(screen.getByTestId("row-BT-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-BT-3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Revival candidates/i }));

    // Only the revival candidate (BT-3) survives the filter.
    expect(screen.getByTestId("row-BT-3")).toBeInTheDocument();
    expect(screen.queryByTestId("row-BT-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-BT-2")).not.toBeInTheDocument();
  });

  it("toggles row selection for bulk actions via the row checkbox", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("check-BT-1"));
    expect(screen.getByText("1/3 selected")).toBeInTheDocument();
  });

  it("opens the breakdown drawer for the clicked ticket and closes it", async () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    expect(screen.queryByTestId("disposition-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("open-BT-1"));
    // The drawer loads via next/dynamic, so it mounts on a later tick.
    const panel = await screen.findByTestId("disposition-panel");
    expect(within(panel).getByText("review:BT-1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-review"));
    expect(screen.queryByTestId("disposition-panel")).not.toBeInTheDocument();
  });

  it("escalates from the breakdown drawer to the full ticket SidePanel", async () => {
    swrData = RESPONSE;
    render(<CleanupPage />);

    fireEvent.click(screen.getByTestId("open-BT-1"));
    await screen.findByTestId("disposition-panel");
    fireEvent.click(screen.getByText("open-ticket"));

    const panel = await screen.findByTestId("side-panel");
    expect(within(panel).getByText("panel:BT-1")).toBeInTheDocument();
  });

  it("passes the disposition filter into the SWR key", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    const dispositionSelect = screen.getByDisplayValue("Any disposition");
    fireEvent.change(dispositionSelect, { target: { value: "dismissed" } });
    expect(swrSpy).toHaveBeenCalledWith(expect.stringContaining("disposition=dismissed"));
  });

  it("shows a loading skeleton before the first response arrives", () => {
    swrData = undefined;
    swrLoading = true;
    const { container } = render(<CleanupPage />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  describe("quick-scan selected", () => {
    beforeEach(() => {
      swrData = RESPONSE;
    });

    it("renders the Quick-scan and Deep-scan actions with their clarifying tooltips", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        render(<CleanupPage />);
        fireEvent.click(screen.getByTestId("check-BT-1"));

        const quickBtn = screen.getByRole("button", { name: /Quick-scan selected/i });
        const deepBtn = screen.getByRole("button", { name: /Deep-scan selected/i });
        expect(quickBtn).toBeInTheDocument();
        expect(deepBtn).toBeInTheDocument();

        // The Tooltip renders its content lazily on focus/hover after a delay.
        // Focus the trigger span and advance past the delay to assert the copy.
        fireEvent.focus(quickBtn.parentElement!);
        vi.advanceTimersByTime(500);
        expect(
          await screen.findByText(/Runs the cheap staleness pass now on the selected tickets \(instant, no AI\)\./i),
        ).toBeInTheDocument();
        fireEvent.blur(quickBtn.parentElement!);

        fireEvent.focus(deepBtn.parentElement!);
        vi.advanceTimersByTime(500);
        expect(
          await screen.findByText(/Adds the selected tickets to the deep-scan queue\..*does not run immediately\./i),
        ).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("posts the selected keys to the quick-scan endpoint and shows the result", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(JSON.stringify({ scored: 2, skipped: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

      render(<CleanupPage />);
      fireEvent.click(screen.getByTestId("check-BT-1"));
      fireEvent.click(screen.getByTestId("check-BT-2"));

      fireEvent.click(screen.getByRole("button", { name: /Quick-scan selected/i }));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/cleanup/quick-scan",
          expect.objectContaining({ method: "POST" }),
        );
      });
      const [, init] = fetchSpy.mock.calls[0];
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ keys: ["BT-1", "BT-2"] });

      // Inline "scored N" result surfaces after the run.
      expect(await screen.findByText(/Scored 2/)).toBeInTheDocument();

      fetchSpy.mockRestore();
    });
  });
});
