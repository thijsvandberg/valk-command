import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketMetaContent } from "./TicketMetaContent";
import type { Ticket, TicketDetail } from "@/types/ticket";
import {
  applyPendingEdits,
  hasPendingEdit,
  __getPendingEdits,
  __resetPendingEdits,
} from "@/components/sprint-board/pendingTicketEdits";
import { userInitials, userColor } from "@/lib/user-utils";

vi.mock("lucide-react", () => {
  const stub = () => null;
  return Object.fromEntries(
    ["ChevronDown", "AlertTriangle", "Play", "Gem", "Boxes", "FileCheck2", "FileX2", "RefreshCw", "Undo2", "Bookmark", "X"].map((n) => [n, stub]),
  );
});

// The test-doc row's fallback read (BRDG-468): key is non-null only when the
// ticket prop carries no testDocState; tests set swrData to exercise it.
let swrData: { testDocState?: Ticket["testDocState"] } | undefined;
vi.mock("swr", () => ({
  default: (key: string | null) => ({ data: key ? swrData : undefined }),
}));

const modalProps = vi.fn();
vi.mock("@/components/sprint-board/TestDocReviewModal", () => ({
  TestDocReviewModal: (props: Record<string, unknown>) => {
    modalProps(props);
    return <div data-testid="test-doc-review-modal" />;
  },
}));

const invalidateTestDocCache = vi.fn();
const revalidateTestDocViews = vi.fn();
vi.mock("@/lib/test-doc-prefetch", () => ({
  invalidateTestDocCache: (...args: unknown[]) => invalidateTestDocCache(...args),
  revalidateTestDocViews: (...args: unknown[]) => revalidateTestDocViews(...args),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) => (
    <a href={href as string} {...rest}>{children as React.ReactNode}</a>
  ),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const updateStoryPoints = vi.fn().mockResolvedValue({});
const updateMetadata = vi.fn().mockResolvedValue({});
const setBookmarked = vi.fn().mockResolvedValue({});
const updateEpic = vi.fn().mockResolvedValue({});
const updateLabels = vi.fn().mockResolvedValue({});
const moveSprint = vi.fn().mockResolvedValue({});
const assign = vi.fn().mockResolvedValue({});
const apiFetch = vi.fn().mockResolvedValue({});
const markTestDocNotNeeded = vi.fn().mockResolvedValue({});
const unmarkTestDocNotNeeded = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  swrFetcher: vi.fn(),
  tickets: {
    updateStoryPoints: (...args: unknown[]) => updateStoryPoints(...args),
    updateMetadata: (...args: unknown[]) => updateMetadata(...args),
    updateEpic: (...args: unknown[]) => updateEpic(...args),
    updateLabels: (...args: unknown[]) => updateLabels(...args),
    setBookmarked: (...args: unknown[]) => setBookmarked(...args),
    markTestDocNotNeeded: (...args: unknown[]) => markTestDocNotNeeded(...args),
    unmarkTestDocNotNeeded: (...args: unknown[]) => unmarkTestDocNotNeeded(...args),
  },
  jira: { assign: (...args: unknown[]) => assign(...args), moveSprint: (...args: unknown[]) => moveSprint(...args) },
}));

const scopedMutateSpy = vi.fn();
vi.mock("@/lib/swr-scoped-mutate", () => ({ scopedMutate: (...args: unknown[]) => scopedMutateSpy(...args) }));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [{ id: 1, name: "Sprint 1" }, { id: 2, name: "Sprint 2" }] }),
  useSprintSlots: () => ({ data: [] }),
  useDevInfo: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/useTicketSessionMap", () => ({ useTicketSessionMap: () => ({ ticketSessionMap: new Map() }) }));

// BRDG-401: a failed sidebar edit must report to the server sink and toast the
// PO (mirroring the board), while keeping the optimistic rollback.
const reportClientError = vi.fn();
vi.mock("@/lib/client-error", () => ({
  reportClientError: (...args: unknown[]) => reportClientError(...args),
}));

// Back useToast with a module-level spy + a live message ref so a real <Toast>
// (stubbed below) renders the text and the spy can be asserted directly.
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

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, jiraStatus, onJiraStatusChange }: { ticketKey: string; jiraStatus?: string; onJiraStatusChange?: (s: string) => void }) =>
    onJiraStatusChange ? (
      <button data-testid="status-pill" onClick={() => onJiraStatusChange("DONE")}>{jiraStatus}</button>
    ) : (
      <span>{jiraStatus ?? ticketKey}</span>
    ),
}));
vi.mock("@/components/shared/Avatar", () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock("@/components/shared/WatchersRow", () => ({ WatchersRow: ({ ticketKey }: { ticketKey: string }) => <span data-testid="watchers-row">{ticketKey}</span> }));
vi.mock("@/components/shared/Tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/shared/Tag", () => ({ Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/shared/ReadinessCell", () => ({ ReadinessCell: () => <span data-testid="readiness-cell" /> }));
vi.mock("@/components/shared/BusinessValuePicker", () => ({ BusinessValuePicker: ({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) => <button data-testid="bv-picker" onClick={() => onChange?.(8)}>{value}</button> }));
vi.mock("@/components/shared/StoryPointPicker", () => ({ StoryPointPicker: ({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) => <button data-testid="sp-picker" onClick={() => onChange(8)}>{value}</button> }));
vi.mock("@/components/shared/AssigneePicker", () => ({ AssigneePicker: ({ value, onChange }: { value: { name: string } | null; onChange?: (u: { accountId: string | null; displayName: string; avatarUrl: string | null } | null) => void }) => <button data-testid="assignee-picker" onClick={() => onChange?.({ accountId: "acc-bob", displayName: "Bob Jones", avatarUrl: null })}>{value?.name}</button> }));
vi.mock("@/components/shared/EpicPicker", () => ({
  EpicPicker: ({ value, onChange }: { value: { name: string } | null; onChange?: (epic: { key: string; name: string } | null) => void }) => (
    <button data-testid="epic-picker" onClick={() => onChange?.({ key: "EPIC-9", name: "Epic Nine" })}>{value?.name}</button>
  ),
}));

const patchTicketCaches = vi.fn();
const patchTicketDetailCache = vi.fn();
const moveTicketSprintCaches = vi.fn();
vi.mock("@/lib/ticket-cache", () => ({
  patchTicketCaches: (...args: unknown[]) => patchTicketCaches(...args),
  patchTicketDetailCache: (...args: unknown[]) => patchTicketDetailCache(...args),
  moveTicketSprintCaches: (...args: unknown[]) => moveTicketSprintCaches(...args),
}));
vi.mock("@/components/shared/LabelPicker", () => ({ LabelPicker: ({ value, onChange }: { value: string[]; onChange?: (v: string[]) => void }) => <button data-testid="label-picker" onClick={() => onChange?.(["frontend", "urgent"])}>{value.join(",")}</button> }));
vi.mock("@/components/sprint-board/TicketTable", () => ({ QualityBadge: ({ score }: { score: number | null }) => <span data-testid="quality-badge">{score}</span> }));
vi.mock("@/components/sprint-board/SprintListModal", () => ({
  SprintListModal: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button data-testid="sprint-select" onClick={() => onSelect("2")}>pick sprint</button>
  ),
}));
vi.mock("@/components/ticket-detail/DevPanel", () => ({ DevPanel: () => <div data-testid="dev-panel" /> }));
vi.mock("@/components/ticket-detail/ConfluencePagesSection", () => ({ ConfluencePagesSection: () => <div data-testid="confluence-section" /> }));
vi.mock("@/lib/date-utils", () => ({ relativeDate: () => "14d ago", formatAbsoluteDate: () => "1 Jan 2026" }));
vi.mock("@/components/shared/StatusBadge", () => ({ JIRA_STATUS_COLORS: { "IN PROGRESS": { bg: "#eee", text: "#111" }, "TO DO": { bg: "#eee", text: "#111" } } }));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "PROJ-42",
    title: "Test ticket title",
    type: "story",
    epicKey: null,
    flagged: false,
    jiraStatus: "IN PROGRESS",
    storyPoints: 5,
    businessValue: 3,
    assignee: { name: "Alice", initials: "A", color: "#abc" },
    epic: "Epic One",
    sprintId: "1",
    qualityScore: 85,
    readiness: "drafting",
    poStatus: "Draft",
    editState: "clean",
    notes: "PO notes here",
    ...overrides,
  };
}

const detail: TicketDetail = {
  description: "A description with an acceptance criteria section",
  reporter: { name: "Bob", initials: "B", color: "#123" },
  parent: null,
  labels: ["frontend"],
  components: ["booking"],
  priority: "Medium",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  attachments: [],
  subtasks: [],
  linkedIssues: [],
  jiraComments: [],
  epicChildren: [],
};

describe("TicketMetaContent", () => {
  beforeEach(() => {
    __resetPendingEdits();
    patchTicketCaches.mockClear();
    patchTicketDetailCache.mockClear();
    reportClientError.mockClear();
    showToast.mockClear();
    lastToast = null;
    // The handlers reject once per failure test; reset to the resolved default.
    updateMetadata.mockResolvedValue({});
    updateStoryPoints.mockResolvedValue({});
    updateEpic.mockResolvedValue({});
    updateLabels.mockResolvedValue({});
    moveSprint.mockResolvedValue({});
    assign.mockResolvedValue({});
    apiFetch.mockResolvedValue({});
    markTestDocNotNeeded.mockClear();
    markTestDocNotNeeded.mockResolvedValue({});
    unmarkTestDocNotNeeded.mockClear();
    unmarkTestDocNotNeeded.mockResolvedValue({});
    invalidateTestDocCache.mockClear();
    revalidateTestDocViews.mockClear();
    modalProps.mockClear();
    setBookmarked.mockClear();
    setBookmarked.mockResolvedValue({});
    scopedMutateSpy.mockClear();
    swrData = undefined;
  });

  it("does not render a bookmark toggle: it lives in the page header, not the sidebar (BRDG-355)", () => {
    render(<TicketMetaContent ticket={makeTicket({ bookmarked: true })} detail={detail} />);
    expect(screen.queryByRole("button", { name: /bookmark/i })).not.toBeInTheDocument();
  });

  it("renders story points and business value", () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} />);
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("5");
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("3");
  });

  it("renders the Jira status, assignee, quality badge, confluence and dev panel", () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} />);
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(screen.getByTestId("assignee-picker")).toHaveTextContent("Alice");
    expect(screen.getByTestId("quality-badge")).toBeInTheDocument();
    expect(screen.getByTestId("confluence-section")).toBeInTheDocument();
    expect(screen.getByTestId("dev-panel")).toBeInTheDocument();
  });

  it("reveals readiness controls behind the More details toggle", () => {
    render(<TicketMetaContent ticket={makeTicket({ qualityScore: null })} detail={detail} />);
    fireEvent.click(screen.getByText("More details"));
    expect(screen.getByTestId("readiness-cell")).toBeInTheDocument();
  });

  it("shows the review/quality panel for non-epic tickets", () => {
    render(<TicketMetaContent ticket={makeTicket({ qualityScore: null })} detail={detail} />);
    fireEvent.click(screen.getByText("More details"));
    expect(screen.getByTitle("View review details")).toBeInTheDocument();
  });

  it("hides the review/quality panel for epics but keeps the dev panel", () => {
    render(<TicketMetaContent ticket={makeTicket({ type: "epic", qualityScore: null })} detail={detail} />);
    fireEvent.click(screen.getByText("More details"));
    expect(screen.queryByTitle("View review details")).not.toBeInTheDocument();
    expect(screen.getByTestId("dev-panel")).toBeInTheDocument();
  });

  it("re-syncs sidebar fields when the same ticket is updated in place (e.g. streamed)", () => {
    const { rerender } = render(<TicketMetaContent ticket={makeTicket()} detail={detail} />);
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("5");
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("3");
    expect(screen.getByTestId("assignee-picker")).toHaveTextContent("Alice");

    rerender(
      <TicketMetaContent
        ticket={makeTicket({
          sprintId: "2",
          storyPoints: 13,
          businessValue: 8,
          assignee: { name: "Bob", initials: "B", color: "#123" },
          jiraStatus: "DONE",
        })}
        detail={detail}
      />,
    );

    expect(screen.getByText("Sprint 2")).toBeInTheDocument();
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("13");
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("8");
    expect(screen.getByTestId("assignee-picker")).toHaveTextContent("Bob");
    expect(screen.getByTestId("status-pill")).toHaveTextContent("DONE");
  });

  it("transitions the Jira status and notifies the host", async () => {
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTestId("status-pill"));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/tickets/PROJ-42/status", { method: "PUT", body: { status: "DONE" } });
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("registers a durable board overlay edit and patches only the detail cache when the epic changes (BRDG-382)", async () => {
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket({ key: "PROJ-42", epic: null, epicKey: null })} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTestId("epic-picker"));

    // The overlay carries the change synchronously so the board chip appears at once,
    // and re-applies it on top of a stale refetch that has not yet caught up to Jira.
    expect(hasPendingEdit("PROJ-42", "epic")).toBe(true);
    expect(hasPendingEdit("PROJ-42", "epicKey")).toBe(true);
    const stale = [makeTicket({ key: "PROJ-42", epic: null, epicKey: null })];
    const merged = applyPendingEdits(stale, __getPendingEdits(), Date.now());
    expect(merged?.[0].epic).toBe("Epic Nine");
    expect(merged?.[0].epicKey).toBe("EPIC-9");

    // Only the per-key detail cache is patched; patching the list would defeat the
    // board overlay's self-heal (see docs/architecture/optimistic-updates.md).
    expect(patchTicketDetailCache).toHaveBeenCalledWith("PROJ-42", { epic: "Epic Nine", epicKey: "EPIC-9" });
    expect(patchTicketCaches).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(updateEpic).toHaveBeenCalledWith("PROJ-42", "EPIC-9");
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("notifies the host via onMutate after a field edit persists", async () => {
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTestId("sp-picker"));
    await waitFor(() => {
      expect(updateStoryPoints).toHaveBeenCalledWith("PROJ-42", 8);
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("moves the row between sprint caches on sprint change and does not revalidate (avoids the stale row popping back)", async () => {
    moveTicketSprintCaches.mockClear();
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTitle("Sprint: Sprint 1"));
    fireEvent.click(screen.getByTestId("sprint-select"));
    expect(moveTicketSprintCaches).toHaveBeenCalledWith(expect.objectContaining({ key: "PROJ-42" }), "2");
    await waitFor(() => expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["PROJ-42"], targetSprintId: "2" }));
    // No revalidation: relying on the optimistic move keeps the row out of the old list.
    expect(onMutate).not.toHaveBeenCalled();
  });

  it("registers a durable overlay edit and patches only the detail cache when story points change (BRDG-382)", async () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByTestId("sp-picker"));
    expect(hasPendingEdit("PROJ-42", "storyPoints")).toBe(true);
    expect(patchTicketDetailCache).toHaveBeenCalledWith("PROJ-42", { storyPoints: 8 });
    expect(patchTicketCaches).not.toHaveBeenCalled();
    await waitFor(() => expect(updateStoryPoints).toHaveBeenCalled());
  });

  it("registers a durable overlay edit when the business value changes (BRDG-382)", async () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByTestId("bv-picker"));
    expect(hasPendingEdit("PROJ-42", "businessValue")).toBe(true);
    expect(patchTicketDetailCache).toHaveBeenCalledWith("PROJ-42", { businessValue: 8 });
    await waitFor(() => expect(updateMetadata).toHaveBeenCalledWith("PROJ-42", { businessValue: 8 }));
  });

  it("registers a durable overlay edit when the Jira status changes (BRDG-382)", async () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByTestId("status-pill"));
    expect(hasPendingEdit("PROJ-42", "jiraStatus")).toBe(true);
    const stale = [makeTicket({ key: "PROJ-42", jiraStatus: "IN PROGRESS" })];
    const merged = applyPendingEdits(stale, __getPendingEdits(), Date.now());
    expect(merged?.[0].jiraStatus).toBe("DONE");
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/tickets/PROJ-42/status", { method: "PUT", body: { status: "DONE" } }));
  });

  it("registers a durable overlay edit with app-consistent initials/color when the assignee changes (BRDG-382)", async () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByTestId("assignee-picker"));
    expect(hasPendingEdit("PROJ-42", "assignee")).toBe(true);
    const stale = [makeTicket({ key: "PROJ-42" })];
    const merged = applyPendingEdits(stale, __getPendingEdits(), Date.now());
    // Matches the shape the server/list produces so self-heal clears on first match.
    expect(merged?.[0].assignee).toEqual({
      name: "Bob Jones",
      initials: userInitials("Bob Jones"),
      color: userColor("Bob Jones"),
    });
  });

  // BRDG-401: the 8 edit handlers used to console.error + roll back silently. They
  // must now report the failure to the server sink and show a "Change reverted"
  // toast (board parity), while keeping the optimistic rollback intact.
  describe("edit failures report + toast while rolling back (BRDG-401)", () => {
    async function expectRevertedToastAndReport(operationFragment: string) {
      await waitFor(() => expect(showToast).toHaveBeenCalled());
      expect(showToast).toHaveBeenCalledWith("Failed to update PROJ-42. Change reverted.");
      // The "Change reverted" toast is actually rendered to the PO.
      expect(screen.getByRole("status")).toHaveTextContent("Failed to update PROJ-42. Change reverted.");
      // The failure is forwarded to the server sink with the operation + key in the
      // context label, and no edited value is passed as a free field.
      expect(reportClientError).toHaveBeenCalledTimes(1);
      const [context, , extra] = reportClientError.mock.calls[0];
      expect(context).toContain(operationFragment);
      expect(context).toContain("PROJ-42");
      expect(extra).toEqual({ source: "ticket-detail" });
    }

    it("story points: toasts + reports + clears the pending edit on failure", async () => {
      updateStoryPoints.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByTestId("sp-picker"));
      await expectRevertedToastAndReport("story-points");
      // Rollback: the overlay edit is cleared so the row falls back to server data.
      expect(hasPendingEdit("PROJ-42", "storyPoints")).toBe(false);
      // Rollback: the detail cache is restored to the previous value (5).
      expect(patchTicketDetailCache).toHaveBeenLastCalledWith("PROJ-42", { storyPoints: 5 });
    });

    it("business value: toasts + reports + clears the pending edit on failure", async () => {
      updateMetadata.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByTestId("bv-picker"));
      await expectRevertedToastAndReport("business-value");
      expect(hasPendingEdit("PROJ-42", "businessValue")).toBe(false);
      expect(patchTicketDetailCache).toHaveBeenLastCalledWith("PROJ-42", { businessValue: 3 });
    });

    it("jira status: toasts + reports + clears the pending edit on failure", async () => {
      apiFetch.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByTestId("status-pill"));
      await expectRevertedToastAndReport("jira-status");
      expect(hasPendingEdit("PROJ-42", "jiraStatus")).toBe(false);
      expect(patchTicketDetailCache).toHaveBeenLastCalledWith("PROJ-42", { jiraStatus: "IN PROGRESS" });
    });

    it("assignee: toasts + reports + clears the pending edit on failure", async () => {
      assign.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByTestId("assignee-picker"));
      await expectRevertedToastAndReport("assignee");
      expect(hasPendingEdit("PROJ-42", "assignee")).toBe(false);
    });

    it("epic: toasts + reports + clears both pending edits on failure", async () => {
      updateEpic.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket({ epic: null, epicKey: null })} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByTestId("epic-picker"));
      await expectRevertedToastAndReport("epic");
      expect(hasPendingEdit("PROJ-42", "epic")).toBe(false);
      expect(hasPendingEdit("PROJ-42", "epicKey")).toBe(false);
    });

    it("sprint: toasts + reports + restores the sprint caches on failure", async () => {
      moveSprint.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByTitle("Sprint: Sprint 1"));
      fireEvent.click(screen.getByTestId("sprint-select"));
      await expectRevertedToastAndReport("sprint");
      // Rollback: the row is moved back to its previous sprint ("1").
      expect(moveTicketSprintCaches).toHaveBeenLastCalledWith(expect.objectContaining({ key: "PROJ-42" }), "1");
    });

    it("labels: toasts + reports + restores the label cache on failure", async () => {
      updateLabels.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket({ qualityScore: null })} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByText("More details"));
      fireEvent.click(screen.getByTestId("label-picker"));
      await expectRevertedToastAndReport("labels");
      // Rollback: labels restored to the detail-provided value (["frontend"]).
      expect(patchTicketCaches).toHaveBeenLastCalledWith("PROJ-42", { labels: ["frontend"] });
    });

    it("PO notes: toasts + reports + restores the note cache on failure", async () => {
      updateMetadata.mockRejectedValueOnce(new Error("boom"));
      render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
      // Expand the PO Note section, then blur the textarea to trigger the save.
      fireEvent.click(screen.getByText("PO Note"));
      const textarea = screen.getByPlaceholderText("Quick annotation...");
      fireEvent.blur(textarea, { target: { value: "new note" } });
      await expectRevertedToastAndReport("po-notes");
      // Rollback: notes restored to the previous value.
      expect(patchTicketCaches).toHaveBeenLastCalledWith("PROJ-42", { notes: "PO notes here" });
    });

    it("does NOT toast or report when the edit succeeds", async () => {
      render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
      fireEvent.click(screen.getByTestId("sp-picker"));
      await waitFor(() => expect(updateStoryPoints).toHaveBeenCalled());
      expect(showToast).not.toHaveBeenCalled();
      expect(reportClientError).not.toHaveBeenCalled();
    });
  });

  // BRDG-333: subtasks are not estimated, scored, reviewed, or developed on their own, so the
  // SP/BV row, the Quality/review panel, and the Development panel are all hidden for them.
  describe("subtask variant (BRDG-333)", () => {
    it("hides the story points and business value row", () => {
      render(<TicketMetaContent ticket={makeTicket({ type: "subtask" })} detail={detail} />);
      expect(screen.queryByTestId("sp-picker")).not.toBeInTheDocument();
      expect(screen.queryByTestId("bv-picker")).not.toBeInTheDocument();
    });

    it("hides the Development panel", () => {
      // Default qualityScore expands the More section, so the panel would render if not guarded.
      render(<TicketMetaContent ticket={makeTicket({ type: "subtask" })} detail={detail} />);
      expect(screen.queryByTestId("dev-panel")).not.toBeInTheDocument();
    });

    it("hides the Quality/review panel under More details", () => {
      render(<TicketMetaContent ticket={makeTicket({ type: "subtask", qualityScore: null })} detail={detail} />);
      fireEvent.click(screen.getByText("More details"));
      expect(screen.queryByTitle("View review details")).not.toBeInTheDocument();
    });

    it("places the Parent above Status for subtasks, but below for other types", () => {
      const detailWithParent: TicketDetail = {
        ...detail,
        parent: { key: "PROJ-1", title: "Parent story", status: "TO DO", type: "story" },
      };

      const { unmount } = render(<TicketMetaContent ticket={makeTicket({ type: "subtask" })} detail={detailWithParent} />);
      let parent = screen.getByRole("link", { name: /Open parent PROJ-1/i });
      let status = screen.getByText("Status");
      // Status follows the Parent in the DOM => Parent is above Status.
      expect(parent.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      unmount();

      render(<TicketMetaContent ticket={makeTicket({ type: "story" })} detail={detailWithParent} />);
      parent = screen.getByRole("link", { name: /Open parent PROJ-1/i });
      status = screen.getByText("Status");
      // Parent follows Status in the DOM => Parent is below Status.
      expect(status.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  // BRDG-332: the Parent field used to wrap a TicketStatusPill (which renders its own key <a>)
  // inside a Next <Link>, producing a nested-anchor hydration crash when a subtask opened in the
  // panel. The fix renders the parent as a non-anchor role="link" control.
  it("renders the Parent field as a non-anchor clickable control and navigates without nesting anchors", () => {
    pushMock.mockClear();
    const parentDetail: TicketDetail = {
      ...detail,
      parent: { key: "PROJ-1", title: "Parent epic", status: "TO DO", type: "epic" },
    };
    const { container } = render(<TicketMetaContent ticket={makeTicket()} detail={parentDetail} />);

    const parentLink = screen.getByRole("link", { name: /Open parent PROJ-1/i });
    expect(parentLink.tagName).not.toBe("A");

    // No anchor anywhere in the tree may contain another anchor.
    container.querySelectorAll("a").forEach((anchor) => {
      expect(anchor.querySelector("a")).toBeNull();
    });

    fireEvent.click(parentLink);
    expect(pushMock).toHaveBeenCalledWith("/tickets/PROJ-1");
  });
});

describe("TicketMetaContent - test-doc row (BRDG-468)", () => {
  beforeEach(() => {
    __resetPendingEdits();
    patchTicketDetailCache.mockClear();
    patchTicketCaches.mockClear();
    reportClientError.mockClear();
    showToast.mockClear();
    lastToast = null;
    markTestDocNotNeeded.mockClear();
    markTestDocNotNeeded.mockResolvedValue({});
    unmarkTestDocNotNeeded.mockClear();
    unmarkTestDocNotNeeded.mockResolvedValue({});
    invalidateTestDocCache.mockClear();
    revalidateTestDocViews.mockClear();
    modalProps.mockClear();
    swrData = undefined;
  });

  function markerEdit() {
    return [...__getPendingEdits().values()].find((e) => e.key === "PROJ-42" && e.field === "testDocState");
  }

  it("renders all four states, including 'No doc yet' for tickets without any state", () => {
    const { rerender } = render(<TicketMetaContent ticket={makeTicket({ testDocState: null })} detail={detail} />);
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("No doc yet");

    rerender(<TicketMetaContent ticket={makeTicket({ testDocState: "accepted" })} detail={detail} />);
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("Saved");

    rerender(<TicketMetaContent ticket={makeTicket({ testDocState: "draft" })} detail={detail} />);
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("Draft pending review");

    rerender(<TicketMetaContent ticket={makeTicket({ testDocState: "not_needed" })} detail={detail} />);
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("Not needed");
  });

  it("hides the row for subtasks and epics", () => {
    const { rerender } = render(<TicketMetaContent ticket={makeTicket({ type: "subtask", testDocState: null })} detail={detail} />);
    expect(screen.queryByTestId("meta-test-doc")).toBeNull();

    rerender(<TicketMetaContent ticket={makeTicket({ type: "epic", testDocState: null })} detail={detail} />);
    expect(screen.queryByTestId("meta-test-doc")).toBeNull();
  });

  it("falls back to the detail payload when the ticket prop carries no testDocState", () => {
    swrData = { testDocState: "draft" };
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} />);
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("Draft pending review");
  });

  it("shows a prominent draft banner only for the draft state, opening the review modal (BRDG-471)", () => {
    const { rerender } = render(<TicketMetaContent ticket={makeTicket({ testDocState: null })} detail={detail} />);
    expect(screen.queryByTestId("test-doc-draft-banner")).toBeNull();

    rerender(<TicketMetaContent ticket={makeTicket({ testDocState: "accepted" })} detail={detail} />);
    expect(screen.queryByTestId("test-doc-draft-banner")).toBeNull();

    rerender(<TicketMetaContent ticket={makeTicket({ testDocState: "draft" })} detail={detail} />);
    const banner = screen.getByTestId("test-doc-draft-banner");
    expect(banner).toHaveTextContent("Test documentation draft ready for review");
    // The banner is additive: the meta row still shows the draft state.
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("Draft pending review");

    fireEvent.click(banner);
    expect(modalProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ keys: ["PROJ-42"], autoGenerate: false }),
    );
  });

  it("hides the draft banner for subtasks and epics (BRDG-471)", () => {
    const { rerender } = render(<TicketMetaContent ticket={makeTicket({ type: "subtask", testDocState: "draft" })} detail={detail} />);
    expect(screen.queryByTestId("test-doc-draft-banner")).toBeNull();

    rerender(<TicketMetaContent ticket={makeTicket({ type: "epic", testDocState: "draft" })} detail={detail} />);
    expect(screen.queryByTestId("test-doc-draft-banner")).toBeNull();
  });

  it("opens the review modal per intent: view (chip), generate, regenerate", () => {
    const { rerender } = render(<TicketMetaContent ticket={makeTicket({ testDocState: null })} detail={detail} />);

    fireEvent.click(screen.getByTestId("meta-test-doc"));
    expect(modalProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ keys: ["PROJ-42"], autoGenerate: false, regenerateOnOpen: false }),
    );
    fireEvent.click(screen.getByLabelText("Generate test documentation"));
    expect(modalProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ keys: ["PROJ-42"], autoGenerate: true, regenerateOnOpen: false }),
    );

    rerender(<TicketMetaContent ticket={makeTicket({ testDocState: "accepted" })} detail={detail} />);
    fireEvent.click(screen.getByLabelText("Regenerate test documentation"));
    expect(modalProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ keys: ["PROJ-42"], autoGenerate: false, regenerateOnOpen: true }),
    );
  });

  it("marks not needed with the full overlay + cache choreography", async () => {
    render(<TicketMetaContent ticket={makeTicket({ testDocState: null })} detail={detail} />);

    fireEvent.click(screen.getByLabelText("Mark as not needing test documentation"));

    await waitFor(() => expect(markTestDocNotNeeded).toHaveBeenCalledWith("PROJ-42"));
    await waitFor(() => expect(markerEdit()).toMatchObject({ value: "not_needed", confirmed: true }));
    // Patches the LIST cache (not detail-only): the board row must hold the new
    // marker state so the overlay self-heals instead of reverting (BRDG-476).
    expect(patchTicketCaches).toHaveBeenCalledWith("PROJ-42", { testDocState: "not_needed" });
    expect(invalidateTestDocCache).toHaveBeenCalledWith("PROJ-42");
    expect(revalidateTestDocViews).toHaveBeenCalled();
    // The row flips optimistically to the marked state with its undo action.
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("Not needed");
    expect(screen.getByLabelText("Remove the 'not needed' marker")).toBeInTheDocument();
  });

  it("removes the marker and returns the row to 'No doc yet'", async () => {
    render(<TicketMetaContent ticket={makeTicket({ testDocState: "not_needed" })} detail={detail} />);

    fireEvent.click(screen.getByLabelText("Remove the 'not needed' marker"));

    await waitFor(() => expect(unmarkTestDocNotNeeded).toHaveBeenCalledWith("PROJ-42"));
    await waitFor(() => expect(markerEdit()).toMatchObject({ value: null, confirmed: true }));
    expect(patchTicketCaches).toHaveBeenCalledWith("PROJ-42", { testDocState: null });
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("No doc yet");
  });

  it("rolls back and reports when the marker write fails", async () => {
    markTestDocNotNeeded.mockRejectedValue(new Error("boom"));
    render(<TicketMetaContent ticket={makeTicket({ testDocState: null })} detail={detail} />);

    fireEvent.click(screen.getByLabelText("Mark as not needing test documentation"));

    await waitFor(() => expect(reportClientError).toHaveBeenCalled());
    expect(hasPendingEdit("PROJ-42", "testDocState")).toBe(false);
    expect(screen.getByTestId("meta-test-doc")).toHaveTextContent("No doc yet");
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("PROJ-42"));
    expect(patchTicketCaches).not.toHaveBeenCalled();
  });
});
