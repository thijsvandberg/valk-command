import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionEndModal, CARRY_OVER_TOAST_KEY } from "./SessionEndModal";

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
  // SessionEndModal resolves only the session's own keys now (BRDG-412); the
  // mock returns the same fixtures the lookups expect.
  useTicketsByKeys: () => mockTickets,
}));

// Mutable across tests; the hook factory reads the current value at render.
let mockSessions: Array<{
  id: string;
  name: string | null;
  scheduledFor: string | null;
  status: string;
  ticketKeys: string[];
  createdAt: string;
}> = [];
const mockMutateSessions = vi.fn();

vi.mock("@/hooks/useRefinementSessions", () => ({
  useRefinementSessions: () => ({ sessions: mockSessions, mutate: mockMutateSessions, isLoading: false }),
}));

// Stub the date picker so tests can drive it with a plain input.
vi.mock("@/components/shared/DateTimePicker", () => ({
  DateTimePicker: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) => (
    <input aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  todayLocalDate: () => "2026-06-23",
}));

vi.mock("@/lib/ticket-cache", () => ({
  patchTicketCaches: vi.fn(),
}));

// BRDG-401: a failed note/status write must report to the server sink and toast
// the PO, instead of the old silent `.catch(() => {})`.
const reportClientError = vi.fn();
vi.mock("@/lib/client-error", () => ({
  reportClientError: (...args: unknown[]) => reportClientError(...args),
}));

const showToast = vi.fn();
let lastToast: React.ReactNode = null;
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    toast: lastToast,
    toastLoading: false,
    showToast: (msg: React.ReactNode) => { lastToast = msg; showToast(msg); },
    dismissToast: () => { lastToast = null; },
  }),
}));
vi.mock("@/components/ui/Toast", () => ({
  Toast: ({ toast }: { toast: React.ReactNode }) => (toast ? <div role="status">{toast}</div> : null),
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
    create: vi.fn().mockResolvedValue({
      id: "new-session",
      name: "Refinement 2026-06-23",
      scheduledFor: null,
      status: "draft",
      ticketKeys: [],
    }),
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
    mockContext.currentIndex = 2;
    mockSessions = [];
    lastToast = null;
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
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

  describe("carry-over to next refinement (BRDG-384)", () => {
    const carryCheckbox = (key: string) =>
      screen.getByLabelText(`Carry ${key} to next refinement`);

    it("pre-selects only the unhandled rows and leaves refined rows and spikes alone", () => {
      // VPL-1: estimated + has subtasks + reached -> handled, not pre-checked.
      // VPL-2: no estimate -> unhandled, pre-checked.
      // VPL-3: spike with no points (exempt) + reached + ready -> handled.
      render(<SessionEndModal />);
      expect(carryCheckbox("VPL-1")).toHaveAttribute("aria-checked", "false");
      expect(carryCheckbox("VPL-2")).toHaveAttribute("aria-checked", "true");
      expect(carryCheckbox("VPL-3")).toHaveAttribute("aria-checked", "false");
    });

    it("pre-selects tickets that were never reached", () => {
      // currentIndex 0 means only VPL-1 was reached; VPL-2 and VPL-3 are unhandled.
      mockContext.currentIndex = 0;
      render(<SessionEndModal />);
      expect(carryCheckbox("VPL-1")).toHaveAttribute("aria-checked", "false");
      expect(carryCheckbox("VPL-2")).toHaveAttribute("aria-checked", "true");
      expect(carryCheckbox("VPL-3")).toHaveAttribute("aria-checked", "true");
    });

    it("updates the carry-over count as rows are toggled", () => {
      render(<SessionEndModal />); // default carried = {VPL-2}
      expect(screen.getByTestId("carry-summary")).toHaveTextContent("1 ticket will move");

      fireEvent.click(carryCheckbox("VPL-1"));
      expect(screen.getByTestId("carry-summary")).toHaveTextContent("2 tickets will move");

      fireEvent.click(carryCheckbox("VPL-3"));
      expect(screen.getByTestId("carry-summary")).toHaveTextContent("3 tickets will move");

      fireEvent.click(carryCheckbox("VPL-2"));
      expect(screen.getByTestId("carry-summary")).toHaveTextContent("2 tickets will move");
    });

    it("hides checkboxes and the segment when every ticket was refined, revealing them via the link", () => {
      // Make all rows handled: VPL-1 already is; estimate + subtask VPL-2; VPL-3 is an exempt, reached spike.
      mockContext.sessionEstimates = { "VPL-2": 5 };
      mockContext.sessionSubtaskCounts = { "VPL-2": 1 };
      render(<SessionEndModal />);

      // No pre-checked rows, no checkboxes, no segment - just the opt-in link.
      expect(screen.queryByLabelText("Carry VPL-1 to next refinement")).not.toBeInTheDocument();
      expect(screen.queryByTestId("carry-summary")).not.toBeInTheDocument();
      const link = screen.getByText("Carry tickets to a next refinement");

      fireEvent.click(link);

      // Now the checkboxes appear (none pre-selected) and the prompt shows.
      expect(screen.getByLabelText("Carry VPL-1 to next refinement")).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText(/did not finish/)).toBeInTheDocument();
    });

    it("Complete creates a new follow-up session with the chosen date and exactly the selected tickets", async () => {
      const { refinementSessions } = await import("@/lib/api-client");
      render(<SessionEndModal />); // default carried = {VPL-2}, mode = new

      fireEvent.change(screen.getByLabelText("Next refinement date"), {
        target: { value: "2026-07-01" },
      });
      fireEvent.click(screen.getByText("Complete"));

      await waitFor(() =>
        expect(refinementSessions.create).toHaveBeenCalledWith({
          name: "Refinement 2026-07-01",
          scheduledFor: "2026-07-01",
          ticketKeys: ["VPL-2"],
        }),
      );
      // The carried ticket is stripped from this session.
      expect(refinementSessions.update).toHaveBeenCalledWith("session-abc", {
        ticketKeys: ["VPL-1", "VPL-3"],
      });
      expect(mockContext.finishSession).toHaveBeenCalled();
    });

    it("Save appends to an existing session, deduped, and removes carried tickets from this session", async () => {
      mockSessions = [
        { id: "session-xyz", name: "Backlog grooming", scheduledFor: null, status: "draft", ticketKeys: ["VPL-2", "VPL-9"], createdAt: "2026-06-20" },
      ];
      const { refinementSessions } = await import("@/lib/api-client");
      render(<SessionEndModal />); // default carried = {VPL-2}

      fireEvent.click(screen.getByText("Existing session"));
      fireEvent.click(screen.getByText("Save"));

      await waitFor(() =>
        // VPL-2 already present -> no duplicate.
        expect(refinementSessions.update).toHaveBeenCalledWith("session-xyz", {
          ticketKeys: ["VPL-2", "VPL-9"],
        }),
      );
      expect(refinementSessions.update).toHaveBeenCalledWith("session-abc", {
        ticketKeys: ["VPL-1", "VPL-3"],
      });
      expect(refinementSessions.create).not.toHaveBeenCalled();
      expect(mockContext.saveSession).toHaveBeenCalled();
    });

    it("carrying zero tickets behaves exactly like today (no create, no ticketKeys write)", async () => {
      const { refinementSessions } = await import("@/lib/api-client");
      render(<SessionEndModal />); // default carried = {VPL-2}

      fireEvent.click(carryCheckbox("VPL-2")); // deselect the only pre-checked row
      fireEvent.click(screen.getByText("Complete"));

      await waitFor(() => expect(mockContext.finishSession).toHaveBeenCalled());
      expect(refinementSessions.create).not.toHaveBeenCalled();
      expect(refinementSessions.update).not.toHaveBeenCalledWith(
        "session-abc",
        expect.objectContaining({ ticketKeys: expect.anything() }),
      );
    });

    it("hands a carry-over confirmation toast to the overview via sessionStorage", async () => {
      const { refinementSessions } = await import("@/lib/api-client");
      render(<SessionEndModal />); // default carried = {VPL-2}, new session named Refinement 2026-06-23

      fireEvent.click(screen.getByText("Complete"));

      await waitFor(() => expect(refinementSessions.create).toHaveBeenCalled());
      await waitFor(() =>
        expect(sessionStorage.getItem(CARRY_OVER_TOAST_KEY)).toBe(
          "Carried 1 ticket to Refinement 2026-06-23",
        ),
      );
    });

    it("flushes pending PO notes before running carry-over", async () => {
      const { refinementSessions } = await import("@/lib/api-client");
      render(<SessionEndModal />);

      const noteButtons = screen.getAllByTitle("Add PO message");
      fireEvent.click(noteButtons[0]);
      fireEvent.change(screen.getByPlaceholderText("PO message for this ticket..."), {
        target: { value: "Carry note" },
      });
      fireEvent.click(screen.getByText("Complete"));

      // Both the note flush and the carry-over write must have happened.
      await waitFor(() =>
        expect(refinementSessions.upsertTicketNote).toHaveBeenCalledWith("session-abc", {
          ticketKey: "VPL-1",
          content: "Carry note",
        }),
      );
      expect(refinementSessions.create).toHaveBeenCalled();
    });
  });

  // BRDG-401: note/status writes used to be `.catch(() => {})`. A failed write
  // must now report to the server sink AND toast the PO, with no value in the log.
  describe("failed data writes are reported + toasted (BRDG-401)", () => {
    it("reports + toasts when the session-note flush write fails", async () => {
      const { refinementSessions } = await import("@/lib/api-client");
      vi.mocked(refinementSessions.upsertTicketNote).mockRejectedValueOnce(new Error("boom"));
      render(<SessionEndModal />);

      const noteButtons = screen.getAllByTitle("Add PO message");
      fireEvent.click(noteButtons[0]);
      fireEvent.change(screen.getByPlaceholderText("PO message for this ticket..."), {
        target: { value: "Important decision" },
      });
      fireEvent.click(screen.getByText("Complete"));

      await waitFor(() => expect(reportClientError).toHaveBeenCalled());
      const [context, , extra] = reportClientError.mock.calls[0];
      expect(context).toContain("ticket-note-flush");
      expect(context).toContain("VPL-1");
      expect(extra).toEqual({ source: "refinement" });
      // The note CONTENT must never be logged (no PII).
      expect(JSON.stringify(reportClientError.mock.calls)).not.toContain("Important decision");
      // The PO is told the save failed.
      await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to save note for VPL-1. Please try again."));
      expect(screen.getByRole("status")).toHaveTextContent("Failed to save note for VPL-1. Please try again.");
    });

    it("reports + toasts when the PO-note (ticket metadata) flush write fails", async () => {
      const { tickets } = await import("@/lib/api-client");
      vi.mocked(tickets.updateMetadata).mockRejectedValueOnce(new Error("boom"));
      render(<SessionEndModal />);

      const noteButtons = screen.getAllByTitle("Add PO message");
      fireEvent.click(noteButtons[0]);
      fireEvent.change(screen.getByPlaceholderText("PO message for this ticket..."), {
        target: { value: "Secret note" },
      });
      fireEvent.click(screen.getByText("Complete"));

      await waitFor(() => expect(reportClientError).toHaveBeenCalled());
      const [context] = reportClientError.mock.calls[0];
      expect(context).toContain("po-note-flush");
      expect(context).toContain("VPL-1");
      expect(JSON.stringify(reportClientError.mock.calls)).not.toContain("Secret note");
      await waitFor(() => expect(showToast).toHaveBeenCalled());
    });

    it("reports + toasts when a spike readiness promotion fails on Complete", async () => {
      const original = mockTickets[2].readiness;
      mockTickets[2].readiness = "ready_to_refine";
      const { tickets } = await import("@/lib/api-client");
      // VPL-3 is the spike promoted to readiness:null on Complete; make it fail.
      vi.mocked(tickets.updateMetadata).mockRejectedValueOnce(new Error("boom"));
      try {
        render(<SessionEndModal />);
        fireEvent.click(screen.getByText("Complete"));

        await waitFor(() => expect(reportClientError).toHaveBeenCalled());
        const [context, , extra] = reportClientError.mock.calls[0];
        expect(context).toContain("spike-readiness-promote");
        expect(context).toContain("VPL-3");
        expect(extra).toEqual({ source: "refinement" });
        await waitFor(() =>
          expect(showToast).toHaveBeenCalledWith("Failed to update readiness for VPL-3. Please try again."),
        );
      } finally {
        mockTickets[2].readiness = original;
      }
    });

    it("does not report or toast when the note flush writes succeed", async () => {
      render(<SessionEndModal />);
      const noteButtons = screen.getAllByTitle("Add PO message");
      fireEvent.click(noteButtons[0]);
      fireEvent.change(screen.getByPlaceholderText("PO message for this ticket..."), {
        target: { value: "All good" },
      });
      fireEvent.click(screen.getByText("Complete"));

      await waitFor(() => expect(mockContext.finishSession).toHaveBeenCalled());
      expect(reportClientError).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it("reports + toasts when the general-comment blur write fails", async () => {
      const { refinementSessions } = await import("@/lib/api-client");
      vi.mocked(refinementSessions.update).mockRejectedValueOnce(new Error("boom"));
      render(<SessionEndModal />);

      const field = screen.getByPlaceholderText("Session notes, decisions, follow-ups...");
      fireEvent.change(field, { target: { value: "Confidential remark" } });
      fireEvent.blur(field);

      await waitFor(() => expect(reportClientError).toHaveBeenCalled());
      const [context, , extra] = reportClientError.mock.calls[0];
      expect(context).toContain("general-comment-save");
      expect(context).toContain("session-abc");
      expect(extra).toEqual({ source: "refinement" });
      // The comment CONTENT (PO-authored data) must never be logged.
      expect(JSON.stringify(reportClientError.mock.calls)).not.toContain("Confidential remark");
      await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to save comment. Please try again."));
    });
  });
});
