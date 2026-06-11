import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecentlyViewedView } from "./RecentlyViewedView";
import { RECENTLY_VIEWED_KEY, readRecentlyViewed } from "@/lib/recently-viewed-store";

const mockPush = vi.fn();
let mockPathname = "/sprint-board";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

// The real pill drags in SWR mutations, pickers and portals; the row contract
// here is only "the pill segments render for this key and own their clicks".
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="ticket-pill">{ticketKey}</span>
  ),
}));

vi.mock("@/lib/api-client", () => ({
  tickets: { detailUrl: (key: string) => `/api/tickets/${key}` },
  // Resolves nothing: rows must render from the stored key + title alone.
  swrFetcher: () => new Promise(() => {}),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [] }),
}));

vi.mock("@/hooks/useTicketHoverData", () => ({
  buildTicketHoverData: () => undefined,
}));

const HOUR = 60 * 60 * 1000;

function seed(entries: { key: string; title?: string; agoMs: number }[]) {
  localStorage.setItem(
    RECENTLY_VIEWED_KEY,
    JSON.stringify(entries.map((e) => ({ key: e.key, title: e.title, viewedAt: Date.now() - e.agoMs }))),
  );
}

function renderView(overrides: { onBack?: () => void; onClose?: () => void } = {}) {
  const onBack = overrides.onBack ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(<RecentlyViewedView open onBack={onBack} onClose={onClose} />);
  return { onBack, onClose };
}

describe("RecentlyViewedView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockPathname = "/sprint-board";
  });

  it("renders entries with pill + title, most-recent-first", () => {
    seed([
      { key: "VPL-2", title: "Ticket two", agoMs: 5 * 60 * 1000 },
      { key: "VPL-1", title: "Ticket one", agoMs: 2 * HOUR },
    ]);
    renderView();

    expect(screen.getAllByTestId("ticket-pill").map((p) => p.textContent)).toEqual(["VPL-2", "VPL-1"]);
    expect(screen.getByText("Ticket two")).toBeInTheDocument();
    expect(screen.getByText("Ticket one")).toBeInTheDocument();
  });

  it("groups entries by day with Today / Yesterday / Earlier headers", () => {
    seed([
      { key: "VPL-1", title: "Fresh", agoMs: 5 * 60 * 1000 },
      { key: "VPL-2", title: "From yesterday", agoMs: 24 * HOUR },
      { key: "VPL-3", title: "Old", agoMs: 4 * 24 * HOUR },
    ]);
    renderView();

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
  });

  it("shows a relative age per row", () => {
    seed([{ key: "VPL-1", title: "Fresh", agoMs: 5 * 60 * 1000 }]);
    renderView();
    expect(screen.getByText("5m")).toBeInTheDocument();
  });

  it("marks the ticket of the current page with the pulse instead of an age", () => {
    mockPathname = "/tickets/VPL-1";
    seed([{ key: "VPL-1", title: "Open now", agoMs: 5 * 60 * 1000 }]);
    renderView();

    expect(screen.getByLabelText("Currently open")).toBeInTheDocument();
    expect(screen.queryByText("5m")).not.toBeInTheDocument();
  });

  it("navigates to the ticket and closes the panel when a row is clicked", () => {
    seed([{ key: "VPL-7", title: "Clickable ticket", agoMs: 1000 }]);
    const { onClose } = renderView();

    fireEvent.click(screen.getByRole("button", { name: /Clickable ticket/ }));
    expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-7");
    expect(onClose).toHaveBeenCalled();
  });

  it("supports keyboard activation of a row", () => {
    seed([{ key: "VPL-8", title: "Keyboard ticket", agoMs: 1000 }]);
    const { onClose } = renderView();

    fireEvent.keyDown(screen.getByRole("button", { name: /Keyboard ticket/ }), { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-8");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders a pill-only row when an entry has no title", () => {
    seed([{ key: "VPL-9", agoMs: 1000 }]);
    renderView();
    expect(screen.getAllByTestId("ticket-pill").map((p) => p.textContent)).toEqual(["VPL-9"]);
  });

  it("renders the empty state when nothing has been viewed", () => {
    renderView();
    expect(screen.getByText("No recently viewed tickets yet")).toBeInTheDocument();
  });

  it("flips back via the header affordance", () => {
    const { onBack } = renderView();
    fireEvent.click(screen.getByRole("button", { name: /Recently viewed/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("clears the list via the footer action", () => {
    seed([{ key: "VPL-1", title: "Soon gone", agoMs: 1000 }]);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(readRecentlyViewed()).toEqual([]);
    expect(screen.getByText("No recently viewed tickets yet")).toBeInTheDocument();
  });

  it("shows the count in the footer", () => {
    seed([
      { key: "VPL-1", title: "One", agoMs: 1000 },
      { key: "VPL-2", title: "Two", agoMs: 2000 },
    ]);
    renderView();
    expect(screen.getByText("Last 2 tickets")).toBeInTheDocument();
  });
});
