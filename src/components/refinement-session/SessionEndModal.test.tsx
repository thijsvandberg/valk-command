import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionEndModal } from "./SessionEndModal";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockContext = {
  queue: ["VPL-1", "VPL-2", "VPL-3"],
  queueMeta: [
    { key: "VPL-1", title: "First ticket" },
    { key: "VPL-2", title: "Second ticket" },
    { key: "VPL-3", title: "Spike investigation" },
  ],
  currentIndex: 2,
  activeSidebarPanel: null,
  sessionActive: true,
  showingEndModal: true,
  sessionStartedAt: Date.now() - 15 * 60 * 1000,
  savedSessionId: "session-abc",
  startSession: vi.fn(),
  nextTicket: vi.fn(),
  prevTicket: vi.fn(),
  goToTicket: vi.fn(),
  toggleSidebarPanel: vi.fn(),
  reorderQueue: vi.fn(),
  openEndModal: vi.fn(),
  closeEndModal: vi.fn(),
  saveSession: vi.fn(),
  finishSession: vi.fn(),
};

vi.mock("@/contexts/RefinementSessionContext", () => ({
  useRefinementSession: () => mockContext,
}));

const mockTickets = [
  { key: "VPL-1", title: "First ticket", type: "story", storyPoints: 3 },
  { key: "VPL-2", title: "Second ticket", type: "story", storyPoints: null },
  { key: "VPL-3", title: "Spike investigation", type: "spike", storyPoints: null },
];

vi.mock("@/hooks/useSprintBoard", () => ({
  useTickets: () => ({ data: mockTickets }),
}));

vi.mock("@/lib/api-client", () => ({
  refinementSessions: {
    get: vi.fn().mockResolvedValue({
      id: "session-abc",
      generalComment: "Existing comment",
      currentIndex: 2,
    }),
    ticketNotes: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    upsertTicketNote: vi.fn().mockResolvedValue({}),
  },
}));

describe("SessionEndModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ticket list with all session tickets", () => {
    render(<SessionEndModal />);
    expect(screen.getByText("VPL-1")).toBeInTheDocument();
    expect(screen.getByText("VPL-2")).toBeInTheDocument();
    expect(screen.getByText("VPL-3")).toBeInTheDocument();
    expect(screen.getByText("First ticket")).toBeInTheDocument();
  });

  it("shows header with ticket count", () => {
    render(<SessionEndModal />);
    expect(screen.getByText("Wrap Up Session")).toBeInTheDocument();
    expect(screen.getByText(/3 tickets refined/)).toBeInTheDocument();
  });

  it("shows general comment field", () => {
    render(<SessionEndModal />);
    expect(screen.getByPlaceholderText("Session notes, decisions, follow-ups...")).toBeInTheDocument();
  });

  it("shows both action buttons", () => {
    render(<SessionEndModal />);
    expect(screen.getByText("Close / Save")).toBeInTheDocument();
    expect(screen.getByText("Done / Finish")).toBeInTheDocument();
  });

  it("shows unestimated indicator for tickets without story points", () => {
    render(<SessionEndModal />);
    expect(screen.getByText("No estimate")).toBeInTheDocument();
  });

  it("shows back to session button", () => {
    render(<SessionEndModal />);
    expect(screen.getByText("Back to Session")).toBeInTheDocument();
  });

  it("calls closeEndModal when back button clicked", () => {
    render(<SessionEndModal />);
    fireEvent.click(screen.getByText("Back to Session"));
    expect(mockContext.closeEndModal).toHaveBeenCalled();
  });

  it("calls saveSession when Close / Save clicked", () => {
    render(<SessionEndModal />);
    fireEvent.click(screen.getByText("Close / Save"));
    expect(mockContext.saveSession).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/refinement/session-abc");
  });

  it("calls finishSession when Done / Finish clicked", () => {
    render(<SessionEndModal />);
    fireEvent.click(screen.getByText("Done / Finish"));
    expect(mockContext.finishSession).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/refinement/session-abc");
  });

  it("shows note editor when message button clicked", () => {
    render(<SessionEndModal />);
    const noteButtons = screen.getAllByTitle("Add PO message");
    fireEvent.click(noteButtons[0]);
    expect(screen.getByPlaceholderText("PO message for this ticket...")).toBeInTheDocument();
  });

  it("loads existing general comment from session", async () => {
    render(<SessionEndModal />);
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText("Session notes, decisions, follow-ups...") as HTMLTextAreaElement;
      expect(textarea.value).toBe("Existing comment");
    });
  });
});
