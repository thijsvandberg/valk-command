import { Suspense, type ReactNode } from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TicketReadiness } from "@/types/ticket";
import TicketDetailPage from "./page";

// The page is driven entirely by useTicketDetailPage; we mock it so each test
// can control the readiness value the header reacts to. Heavy children are
// stubbed because the header button logic is the only thing under test here.

const baseTicket = {
  key: "VPL-100",
  title: "Analyze booking data storage and retention",
  type: "task" as const,
  jiraStatus: "TO DO" as const,
  readiness: null as TicketReadiness | null,
  removedFromJiraAt: null as string | null,
  editState: "clean",
  epic: null,
  epicKey: null,
};

const mockHook: Record<string, unknown> = {};

function resetHook(readiness: TicketReadiness | null, overrides: Record<string, unknown> = {}) {
  for (const k of Object.keys(mockHook)) delete mockHook[k];
  Object.assign(mockHook, {
    ticket: { ...baseTicket, readiness },
    detail: null,
    localEdits: null,
    apiData: { title: baseTicket.title },
    ticketLoading: false,
    jiraCheckState: "found",
    mutateTicket: vi.fn(),
    isFollowed: false,
    follow: vi.fn(),
    unfollow: vi.fn(),
    hasLocalTitleEdit: false,
    hasLocalDescEdit: false,
    isTitleEditing: false,
    isDescEditing: false,
    setIsTitleEditing: vi.fn(),
    setIsDescEditing: vi.fn(),
    handleTitleLocalEdit: vi.fn(),
    handleDescLocalEdit: vi.fn(),
    showConflictWarning: false,
    showConflictDiff: false,
    setShowConflictDiff: vi.fn(),
    metadataOnlyConflict: false,
    isDiscarding: false,
    discardError: null,
    isPushing: false,
    pushError: null,
    overrideConfirmed: false,
    setOverrideConfirmed: vi.fn(),
    draftDiscardKey: 0,
    handleDiscardDraft: vi.fn(),
    handlePushToJira: vi.fn(),
    linkCopied: false,
    handleCopyLink: vi.fn(),
    reviewData: null,
    reviewCount: 0,
    versionCount: 0,
    hasActiveSession: false,
    isDeletingSession: false,
    handleDeleteSession: vi.fn(),
    isRefreshing: false,
    handleRefreshFromJira: vi.fn(),
    isFlagged: false,
    flagReasonInput: "",
    setFlagReasonInput: vi.fn(),
    handleFlag: vi.fn(),
    handleUnflag: vi.fn(),
    handleTypeChange: vi.fn(),
    handleReadinessChange: vi.fn(),
    handleJiraStatusChange: vi.fn(),
    handleRemoteChanged: vi.fn(),
    ticketSprintId: null,
    ticketSprintLabel: null,
    handleConflictResolved: vi.fn(),
    ...overrides,
  });
}

vi.mock("@/hooks/useTicketDetailPage", () => ({
  useTicketDetailPage: () => mockHook,
}));

let mockSessions: Array<{ ticketKeys: string[]; status: string }> = [];
vi.mock("@/hooks/useRefinementSessions", () => ({
  useRefinementSessions: () => ({ sessions: mockSessions, mutate: vi.fn(), isLoading: false }),
}));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: () => null }));
vi.mock("@/hooks/useLocalStorage", () => ({ useLocalStorage: () => [false, vi.fn()] }));

vi.mock("@/components/shared/ViewHeader", () => ({
  ViewHeader: ({ actions, children }: { actions?: ReactNode; children?: ReactNode }) => (
    <div data-testid="view-header">
      {actions}
      {children}
    </div>
  ),
  ViewHeaderDivider: () => null,
}));
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: () => <div data-testid="status-pill" />,
}));
vi.mock("@/components/ticket-detail/TicketTabContent", () => ({
  TicketTabContent: () => <div data-testid="tab-content" />,
}));
vi.mock("@/components/ticket-detail/TicketSidebar", () => ({
  TicketSidebar: () => <div data-testid="sidebar" />,
  SIDEBAR_COLLAPSED_KEY: "sidebar-collapsed",
}));
vi.mock("@/components/refinement-session/AddToRefinementModal", () => ({
  AddToRefinementModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-to-refinement-modal" /> : null,
}));
vi.mock("@/components/sprint-board/SearchModal", () => ({
  SearchModal: () => null,
}));
vi.mock("@/components/ticket-detail/TicketPreviewPanel", () => ({
  TicketPreviewPanel: () => null,
}));
vi.mock("@/components/shared/TicketChatPane", () => ({
  TicketChatPane: () => null,
}));

// use(params) suspends on first render; flushing microtasks inside act lets
// the resolved params promise commit before we query the DOM.
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <TicketDetailPage params={Promise.resolve({ key: "VPL-100" })} />
      </Suspense>,
    );
  });
}

describe("TicketDetailPage header - Add to refinement button", () => {
  beforeEach(() => {
    resetHook(null);
    mockSessions = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a directly visible Add to refinement button when readiness is ready_to_refine", async () => {
    resetHook("ready_to_refine");
    await renderPage();
    // The header button is rendered in addition to the "..." menu item (which
    // is hidden until the menu is opened), so exactly one is visible up front.
    expect(screen.getAllByText("Add to refinement")).toHaveLength(1);
  });

  it("opens the Add to refinement modal when the header button is clicked", async () => {
    resetHook("ready_to_refine");
    await renderPage();
    fireEvent.click(screen.getByText("Add to refinement"));
    expect(screen.getByTestId("add-to-refinement-modal")).toBeInTheDocument();
  });

  it.each(["drafting", "waiting_for_feedback", "on_hold", null] as const)(
    "does not show the header button when readiness is %s",
    async (readiness) => {
      resetHook(readiness);
      await renderPage();
      expect(screen.getByTestId("status-pill")).toBeInTheDocument();
      expect(screen.queryByText("Add to refinement")).not.toBeInTheDocument();
    },
  );

  it("does not show the header button when the ticket is removed from Jira", async () => {
    resetHook("ready_to_refine", {
      ticket: { ...baseTicket, readiness: "ready_to_refine", removedFromJiraAt: "2026-01-01T00:00:00.000Z" },
    });
    await renderPage();
    expect(screen.getByTestId("status-pill")).toBeInTheDocument();
    expect(screen.queryByText("Add to refinement")).not.toBeInTheDocument();
  });

  it.each(["draft", "in_progress"] as const)(
    "does not show the header button when the ticket is already in a %s refinement session",
    async (status) => {
      resetHook("ready_to_refine");
      mockSessions = [{ ticketKeys: ["VPL-100"], status }];
      await renderPage();
      expect(screen.getByTestId("status-pill")).toBeInTheDocument();
      expect(screen.queryByText("Add to refinement")).not.toBeInTheDocument();
    },
  );

  it("still shows the header button when the ticket is only in a completed refinement session", async () => {
    resetHook("ready_to_refine");
    mockSessions = [{ ticketKeys: ["VPL-100"], status: "completed" }];
    await renderPage();
    expect(screen.getAllByText("Add to refinement")).toHaveLength(1);
  });

  it("still shows the header button when an active session contains other tickets only", async () => {
    resetHook("ready_to_refine");
    mockSessions = [{ ticketKeys: ["VPL-999"], status: "in_progress" }];
    await renderPage();
    expect(screen.getAllByText("Add to refinement")).toHaveLength(1);
  });

  it.each(["DONE", "DEPRECATED"] as const)(
    "does not show the header button when the ticket Jira status is %s",
    async (jiraStatus) => {
      resetHook("ready_to_refine", {
        ticket: { ...baseTicket, readiness: "ready_to_refine", jiraStatus },
      });
      await renderPage();
      expect(screen.getByTestId("status-pill")).toBeInTheDocument();
      expect(screen.queryByText("Add to refinement")).not.toBeInTheDocument();
    },
  );
});
