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
  total: 2,
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

  it("renders a row per ticket with the live staleness score and a placeholder for dormant topics", () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    expect(screen.getByText("BT-1")).toBeInTheDocument();
    expect(screen.getByText("Ancient ticket")).toBeInTheDocument();
    expect(screen.getByText("BT-2")).toBeInTheDocument();
    // The staleness column header is live; the replaced column is a placeholder.
    // "Staleness" also appears in the sort dropdown, so scope to the table head.
    const head = screen.getByRole("table").querySelector("thead")!;
    expect(within(head).getByText("Staleness")).toBeInTheDocument();
    expect(within(head).getByText("Replaced area")).toBeInTheDocument();
    // Candidate disposition badge renders ("Candidate" is also a dropdown option,
    // so scope to the table body).
    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    expect(within(tableBody).getByText("Candidate")).toBeInTheDocument();
    // Never-scanned ticket shows "never".
    expect(screen.getByText("never")).toBeInTheDocument();
  });

  it("opens the breakdown drawer for the clicked ticket and closes it", async () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    expect(screen.queryByTestId("disposition-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Ancient ticket"));
    // The drawer loads via next/dynamic, so it mounts on a later tick.
    const panel = await screen.findByTestId("disposition-panel");
    expect(within(panel).getByText("review:BT-1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-review"));
    expect(screen.queryByTestId("disposition-panel")).not.toBeInTheDocument();
  });

  it("escalates from the breakdown drawer to the full ticket SidePanel", async () => {
    swrData = RESPONSE;
    render(<CleanupPage />);

    fireEvent.click(screen.getByText("Ancient ticket"));
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
