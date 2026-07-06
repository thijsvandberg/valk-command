import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookmarksView } from "./BookmarksView";
import type { BookmarkEntry } from "@/lib/bookmarks";

const mockPush = vi.fn();
let mockPathname = "/sprint-board";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}));

// The real pill drags in SWR, pickers and portals; the row contract here is only
// "the pill segments render for this key".
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="ticket-pill">{ticketKey}</span>,
}));

vi.mock("@/lib/api-client", () => ({
  tickets: { bookmarksUrl: () => "/api/bookmarks" },
  swrFetcher: vi.fn(),
}));

// Control the bookmark payload per test.
let swrState: { data?: BookmarkEntry[]; error?: unknown; isLoading?: boolean };
vi.mock("swr", () => ({
  default: () => ({ ...swrState, mutate: vi.fn() }),
}));

function entry(over: Partial<BookmarkEntry> = {}): BookmarkEntry {
  return {
    key: "VPL-1",
    title: "Ticket one",
    type: "story",
    jiraStatus: "TO DO",
    sprintName: "Sprint 42",
    notes: "",
    bookmarkedAt: "2026-07-04T10:00:00.000Z",
    ...over,
  };
}

function renderView(overrides: { onBack?: () => void; onClose?: () => void } = {}) {
  const onBack = overrides.onBack ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(<BookmarksView open onBack={onBack} onClose={onClose} />);
  return { onBack, onClose };
}

describe("BookmarksView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/sprint-board";
    swrState = { data: [], isLoading: false };
  });

  it("renders entries with pill + title", () => {
    swrState = { data: [entry({ key: "VPL-2", title: "Second" }), entry({ key: "VPL-1", title: "First" })] };
    renderView();
    expect(screen.getAllByTestId("ticket-pill").map((p) => p.textContent)).toEqual(["VPL-2", "VPL-1"]);
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
  });

  it("shows the note icon only for entries that have a PO note", () => {
    swrState = { data: [entry({ key: "VPL-1", notes: "revisit after spike" }), entry({ key: "VPL-2", notes: "" })] };
    renderView();
    // Exactly one entry has a note, so exactly one note icon renders.
    expect(screen.getAllByLabelText("PO note")).toHaveLength(1);
  });

  it("reveals the PO note on hover of the note icon", async () => {
    swrState = { data: [entry({ notes: "why I saved this" })] };
    renderView();
    fireEvent.mouseEnter(screen.getByLabelText("PO note").parentElement!);
    expect(await screen.findByText("why I saved this")).toBeInTheDocument();
  });

  it("truncates a long PO note to a snippet in the hover (BRDG-481)", async () => {
    const longNote = "x".repeat(400);
    swrState = { data: [entry({ notes: longNote })] };
    renderView();
    fireEvent.mouseEnter(screen.getByLabelText("PO note").parentElement!);
    const tip = await screen.findByText((t) => t.startsWith("xxxx") && t.endsWith("…"));
    // 180-char cap plus the single ellipsis character; never the full 400-char note.
    expect(tip.textContent!.length).toBeLessThanOrEqual(181);
    expect(tip.textContent).not.toBe(longNote);
  });

  it("shows a backlog label when the ticket has no sprint", () => {
    swrState = { data: [entry({ sprintName: null })] };
    renderView();
    expect(screen.getByText("Backlog")).toBeInTheDocument();
  });

  it("links 'See all' to the full /bookmarks page", () => {
    swrState = { data: [entry()] };
    renderView();
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute("href", "/bookmarks");
  });

  it("opens the ticket and closes the panel when a row is clicked", () => {
    swrState = { data: [entry({ key: "VPL-7", title: "Clickable" })] };
    const { onClose } = renderView();
    fireEvent.click(screen.getByRole("button", { name: /Clickable/ }));
    expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-7");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders the empty state when there are no bookmarks", () => {
    swrState = { data: [], isLoading: false };
    renderView();
    expect(screen.getByText("No bookmarks yet")).toBeInTheDocument();
  });

  it("surfaces a fetch error", () => {
    swrState = { error: new Error("boom"), isLoading: false };
    renderView();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
