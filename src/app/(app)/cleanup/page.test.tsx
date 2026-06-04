import type { ReactNode } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

// The cleanup list reuses the app-standard ChildIssueRow (which renders the
// TicketStatusPill). Stub it so the test asserts the wiring contract — the ticket
// item it receives, its checkbox/selection callbacks, and the trailing badges
// supplied in metadataSlot — without mounting the full ticket-detail pill tree.
vi.mock("@/components/ticket-detail/ChildIssueRow", () => ({
  ChildIssueRow: ({
    item,
    isChecked,
    onSelect,
    onCheckboxClick,
    metadataSlot,
  }: {
    item: { key: string; title: string };
    isChecked: boolean;
    onSelect?: (key: string) => void;
    onCheckboxClick?: (e: unknown) => void;
    metadataSlot?: ReactNode;
  }) => (
    <div data-testid={`row-${item.key}`}>
      <button data-testid={`open-${item.key}`} onClick={() => onSelect?.(item.key)}>
        {item.key} {item.title}
      </button>
      <button
        data-testid={`check-${item.key}`}
        aria-pressed={isChecked}
        onClick={() => onCheckboxClick?.({})}
      >
        select
      </button>
      <div data-testid={`meta-${item.key}`}>{metadataSlot}</div>
    </div>
  ),
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

const RESPONSE: CleanupResponse = {
  total: 3,
  topics: [
    { key: "staleness", label: "Staleness", live: true },
    { key: "replaced", label: "Replaced area", live: false },
  ],
  rows: [
    {
      key: "BT-1",
      title: "Ancient ticket",
      status: "TO DO",
      lastScannedAt: "2026-06-01T00:00:00Z",
      topicScores: { staleness: 0.82 },
      scanOverall: 0.82,
      disposition: "candidate",
      revivalScore: null,
      revivalRationale: null,
    },
    {
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
    swrData = { total: 0, topics: RESPONSE.topics, rows: [] };
    render(<CleanupPage />);
    expect(screen.getByText("Nothing scanned yet")).toBeInTheDocument();
    expect(screen.getByText(/Tier-1 staleness runs in the background/i)).toBeInTheDocument();
  });

  it("renders one standard row per ticket via ChildIssueRow", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    expect(screen.getByTestId("row-BT-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-BT-2")).toBeInTheDocument();
    expect(screen.getByTestId("row-BT-3")).toBeInTheDocument();
    expect(within(screen.getByTestId("row-BT-1")).getByText(/Ancient ticket/)).toBeInTheDocument();
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
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
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
});
