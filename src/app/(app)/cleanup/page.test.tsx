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
    return { data: swrData, isLoading: swrLoading };
  },
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
    },
    {
      key: "BT-2",
      title: "Fresh-ish ticket",
      status: "TO DO",
      lastScannedAt: null,
      topicScores: {},
      scanOverall: null,
      disposition: null,
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

  it("opens the SidePanel for the clicked ticket and closes it", async () => {
    swrData = RESPONSE;
    render(<CleanupPage />);
    expect(screen.queryByTestId("side-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Ancient ticket"));
    // The panel loads via next/dynamic, so it mounts on a later tick.
    const panel = await screen.findByTestId("side-panel");
    expect(within(panel).getByText("panel:BT-1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-panel"));
    expect(screen.queryByTestId("side-panel")).not.toBeInTheDocument();
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
