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
  sessionEstimates: {} as Record<string, number | null>,
  sessionSubtaskCounts: {} as Record<string, number>,
  startSession: vi.fn(),
  recordEstimate: vi.fn(),
  recordSubtaskCount: vi.fn(),
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
  { key: "VPL-1", title: "First ticket", type: "story", storyPoints: 3, jiraStatus: "TO DO", readiness: null, totalSubtaskCount: 2 },
  { key: "VPL-2", title: "Second ticket", type: "story", storyPoints: null, jiraStatus: "IN PROGRESS", readiness: "drafting", totalSubtaskCount: 0 },
  { key: "VPL-3", title: "Spike investigation", type: "spike", storyPoints: null, jiraStatus: "TO DO", readiness: null, totalSubtaskCount: 0 },
];

vi.mock("@/hooks/useSprintBoard", () => ({
  useTickets: () => ({ data: mockTickets }),
}));

vi.mock("@/lib/ticket-cache", () => ({
  patchTicketCaches: vi.fn(),
}));

// Stub the pill with buttons that fire the change callbacks, keeping the
// ticket key visible for the render assertions.
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, onJiraStatusChange, onReadinessChange, onIssueTypeChange }: {
    ticketKey: string;
    onJiraStatusChange?: (s: string) => void;
    onReadinessChange?: (r: string | null) => void;
    onIssueTypeChange?: (t: string) => void;
  }) => (
    <div>
      <span>{ticketKey}</span>
      <button aria-label={`set-status-${ticketKey}`} onClick={() => onJiraStatusChange?.("DONE")} />
      <button aria-label={`set-readiness-${ticketKey}`} onClick={() => onReadinessChange?.("drafting")} />
      <button aria-label={`set-type-${ticketKey}`} onClick={() => onIssueTypeChange?.("bug")} />
    </div>
  ),
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
  tickets: {
    updateMetadata: vi.fn().mockResolvedValue({}),
  },
  apiFetch: vi.fn().mockResolvedValue({}),
}));

describe("SessionEndModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.sessionEstimates = {};
    mockContext.sessionSubtaskCounts = {};
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
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("shows unestimated indicator for tickets without story points", () => {
    render(<SessionEndModal />);
    expect(screen.getByText("No estimate")).toBeInTheDocument();
  });

  it("prefers estimates recorded during the session over the (stale) ticket cache", () => {
    // Cache still says VPL-2 has no points; the session picked 5 just now.
    mockContext.sessionEstimates = { "VPL-2": 5 };
    render(<SessionEndModal />);
    expect(screen.queryByText("No estimate")).not.toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText(/unestimated/)).not.toBeInTheDocument();
  });

  it("shows a cleared session estimate as unestimated even when the cache has points", () => {
    // Cache still says VPL-1 has 3 points; the session cleared the estimate.
    mockContext.sessionEstimates = { "VPL-1": null };
    render(<SessionEndModal />);
    expect(screen.getAllByText("No estimate")).toHaveLength(2);
    expect(screen.getByText(/2 unestimated/)).toBeInTheDocument();
  });

  it("shows a no-subtasks alert only for tickets without subtasks", () => {
    render(<SessionEndModal />);
    // VPL-2 and VPL-3 have no subtasks; VPL-1 has 2, so it is not flagged.
    expect(screen.getAllByText("No subtasks")).toHaveLength(2);
  });

  it("prefers subtask counts observed during the session over the (stale) ticket cache", () => {
    // Cache still says VPL-2 has no subtasks; the session created one just now.
    mockContext.sessionSubtaskCounts = { "VPL-2": 1 };
    render(<SessionEndModal />);
    // Only VPL-3 remains flagged; VPL-2 is no longer a false "No subtasks".
    expect(screen.getAllByText("No subtasks")).toHaveLength(1);
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

  it("calls saveSession when Save clicked", async () => {
    render(<SessionEndModal />);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(mockContext.saveSession).toHaveBeenCalled());
    expect(mockPush).toHaveBeenCalledWith("/refinement/session-abc");
  });

  it("navigates to the guid-less overview when Complete clicked", async () => {
    render(<SessionEndModal />);
    fireEvent.click(screen.getByText("Complete"));
    await waitFor(() => expect(mockContext.finishSession).toHaveBeenCalled());
    // Completed sessions leave the overview, so we must not return to their guid.
    expect(mockPush).toHaveBeenCalledWith("/refinement");
  });

  it("promotes a Ready-to-Refine spike to Ready for Development on Complete", async () => {
    const original = mockTickets[2].readiness;
    mockTickets[2].readiness = "ready_to_refine";
    const { tickets } = await import("@/lib/api-client");
    try {
      render(<SessionEndModal />);
      fireEvent.click(screen.getByText("Complete"));
      await waitFor(() =>
        expect(tickets.updateMetadata).toHaveBeenCalledWith("VPL-3", { readiness: null }),
      );
    } finally {
      mockTickets[2].readiness = original;
    }
  });

  it("does not change a spike that is not Ready to Refine", async () => {
    // VPL-3 spike has readiness null in the default mock; stories are never touched.
    const { tickets } = await import("@/lib/api-client");
    render(<SessionEndModal />);
    fireEvent.click(screen.getByText("Complete"));
    await waitFor(() => expect(mockContext.finishSession).toHaveBeenCalled());
    expect(tickets.updateMetadata).not.toHaveBeenCalledWith("VPL-3", { readiness: null });
  });

  it("seeds an existing ticket PO note so it is visible", async () => {
    const original = (mockTickets[1] as { notes?: string }).notes;
    (mockTickets[1] as { notes?: string }).notes = "Existing PO note";
    try {
      render(<SessionEndModal />);
      await waitFor(() =>
        expect(screen.getByDisplayValue("Existing PO note")).toBeInTheDocument(),
      );
    } finally {
      (mockTickets[1] as { notes?: string }).notes = original;
    }
  });

  it("flushes a pending ticket note before completing", async () => {
    const { tickets, refinementSessions } = await import("@/lib/api-client");
    render(<SessionEndModal />);
    const noteButtons = screen.getAllByTitle("Add PO message");
    fireEvent.click(noteButtons[0]);
    const noteInput = screen.getByPlaceholderText("PO message for this ticket...");
    fireEvent.change(noteInput, { target: { value: "Discussed scope" } });

    // Click Complete immediately, before the debounce timer fires.
    fireEvent.click(screen.getByText("Complete"));

    await waitFor(() =>
      expect(refinementSessions.upsertTicketNote).toHaveBeenCalledWith(
        "session-abc",
        { ticketKey: "VPL-1", content: "Discussed scope" },
      ),
    );
    expect(tickets.updateMetadata).toHaveBeenCalledWith("VPL-1", { poNotes: "Discussed scope" });
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

  describe("instant pill updates (BRDG-334)", () => {
    it("patches the tickets SWR cache when a status pill changes", async () => {
      const { patchTicketCaches } = await import("@/lib/ticket-cache");
      const { apiFetch } = await import("@/lib/api-client");
      render(<SessionEndModal />);

      fireEvent.click(screen.getByLabelText("set-status-VPL-1"));

      expect(patchTicketCaches).toHaveBeenCalledWith("VPL-1", { jiraStatus: "DONE" });
      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith("/api/tickets/VPL-1/status", { method: "PUT", body: { status: "DONE" } }),
      );
    });

    it("rolls the status patch back when the write fails", async () => {
      const { patchTicketCaches } = await import("@/lib/ticket-cache");
      const { apiFetch } = await import("@/lib/api-client");
      vi.mocked(apiFetch).mockRejectedValueOnce(new Error("boom"));
      render(<SessionEndModal />);

      fireEvent.click(screen.getByLabelText("set-status-VPL-1"));

      await waitFor(() =>
        expect(patchTicketCaches).toHaveBeenCalledWith("VPL-1", { jiraStatus: "TO DO" }),
      );
    });

    it("patches readiness optimistically", async () => {
      const { patchTicketCaches } = await import("@/lib/ticket-cache");
      const { tickets } = await import("@/lib/api-client");
      render(<SessionEndModal />);

      fireEvent.click(screen.getByLabelText("set-readiness-VPL-1"));

      expect(patchTicketCaches).toHaveBeenCalledWith("VPL-1", { readiness: "drafting" });
      await waitFor(() =>
        expect(tickets.updateMetadata).toHaveBeenCalledWith("VPL-1", { readiness: "drafting" }),
      );
    });

    it("patches issue type optimistically and rolls back on failure", async () => {
      const { patchTicketCaches } = await import("@/lib/ticket-cache");
      const { apiFetch } = await import("@/lib/api-client");
      vi.mocked(apiFetch).mockRejectedValueOnce(new Error("boom"));
      render(<SessionEndModal />);

      fireEvent.click(screen.getByLabelText("set-type-VPL-2"));

      expect(patchTicketCaches).toHaveBeenCalledWith("VPL-2", { type: "bug" });
      await waitFor(() =>
        expect(patchTicketCaches).toHaveBeenCalledWith("VPL-2", { type: "story" }),
      );
    });
  });
});
