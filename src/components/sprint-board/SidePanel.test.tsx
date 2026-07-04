import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SidePanel } from "./SidePanel";
import { readRecentlyViewed } from "@/lib/recently-viewed-store";
import type { Ticket } from "@/types/ticket";

// Use the real icon set: transitively imported icons (e.g. EditStateDot pulling
// in the issue-type icons) would otherwise need to be listed by hand and silently
// break the suite at import time whenever a new icon enters the graph.
vi.mock("lucide-react", async (importOriginal) => await importOriginal());

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) => (
    <a href={href as string} {...rest}>{children as React.ReactNode}</a>
  ),
}));

vi.mock("next/dynamic", () => ({ default: () => () => null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ onClick, children, icon, ...rest }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} aria-label={rest["aria-label"] as string}>{icon as React.ReactNode}{children as React.ReactNode}</button>
  ),
}));

// The hook is rebuilt-upon; mock it so the panel renders deterministically.
const followFn = vi.fn();
const unfollowFn = vi.fn();
function makeHook(overrides: Record<string, unknown> = {}) {
  return {
    ticket: undefined,
    detail: { description: "A description", labels: [], components: [], reporter: null, parent: null, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
    localEdits: undefined,
    mutateTicket: vi.fn(),
    handleJiraStatusChange: vi.fn(),
    handleTypeChange: vi.fn(),
    handleReadinessChange: vi.fn(),
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
    handleConflictResolved: vi.fn(),
    reviewData: { reviews: [], currentVersionHash: null },
    reviewCount: 0,
    versionCount: 3,
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
    isFollowed: false,
    follow: followFn,
    unfollow: unfollowFn,
    linkCopied: false,
    handleCopyLink: vi.fn(),
    ...overrides,
  };
}
let hookValue = makeHook();
vi.mock("@/hooks/useTicketDetailPage", () => ({
  useTicketDetailPage: () => hookValue,
}));

let refinementSessionsValue: Array<{ id: string; status: string; ticketKeys: string[] }> = [];
vi.mock("@/hooks/useRefinementSessions", () => ({
  useRefinementSessions: () => ({ sessions: refinementSessionsValue }),
}));

vi.mock("@/lib/prefetch", () => ({ prefetchTicketPage: vi.fn() }));

// Render the tab content stub so we can assert tabs + the injected meta block.
// `tab-has-meta` marks the stacked layout (meta injected under the Content tab).
// The tabs and the header action buttons now scroll with the content, so they
// live inside this component and only render when SidePanel passes them via
// `renderTabBar` / `tabBarActions`.
vi.mock("@/components/ticket-detail/TicketTabContent", () => ({
  TicketTabContent: ({ activeTab, metaContent, renderTabBar, tabBarActions, tabBarLeading, ticketKey, onSelectTicket }: { activeTab: string; metaContent?: React.ReactNode; renderTabBar?: boolean; tabBarActions?: React.ReactNode; tabBarLeading?: React.ReactNode; ticketKey?: string; onSelectTicket?: (key: string) => void }) => (
    <div data-testid="tab-content">
      <span data-testid="active-tab">{activeTab}</span>
      <span data-testid="current-key">{ticketKey}</span>
      {/* Stand-in for a linked/child row: lets tests drive an in-panel drill-down. */}
      <button data-testid="drill" onClick={() => onSelectTicket?.("PROJ-99")}>drill</button>
      {renderTabBar && ["Content", "History", "Review", "Development"].map((label) => <span key={label}>{label}</span>)}
      {renderTabBar && tabBarLeading}
      {renderTabBar && tabBarActions}
      {metaContent != null && <span data-testid="tab-has-meta" />}
      {metaContent}
    </div>
  ),
}));

// The shared meta panel is its own unit (TicketMetaContent.test.tsx); stub it here.
vi.mock("@/components/ticket-detail/TicketMetaContent", () => ({
  TicketMetaContent: () => <div data-testid="meta-content" />,
}));

vi.mock("@/components/shared/TicketStatusPill", () => ({ TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="ticket-key">{ticketKey}</span> }));
vi.mock("@/components/shared/Tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/shared/Popover", () => ({ Popover: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div data-testid="more-menu">{children}</div> : null) }));
vi.mock("@/components/shared/ConfirmDialog", () => ({ ConfirmDialog: () => null }));

// jsdom localStorage stub
Object.defineProperty(window, "localStorage", {
  value: {
    store: {} as Record<string, string>,
    getItem(key: string) { return this.store[key] ?? null; },
    setItem(key: string, value: string) { this.store[key] = value; },
    removeItem(key: string) { delete this.store[key]; },
    clear() { this.store = {}; },
  },
  writable: true,
});

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

describe("SidePanel", () => {
  const defaultProps = {
    ticket: makeTicket(),
    poStatus: "Draft" as const,
    readiness: "drafting" as const,
    onPoStatusChange: vi.fn(),
    onReadinessChange: vi.fn(),
    onNotesChange: vi.fn(),
    onClose: vi.fn(),
    onShowToast: vi.fn(),
  };

  beforeEach(() => {
    hookValue = makeHook();
    refinementSessionsValue = [];
    window.localStorage.clear();
  });

  it("renders the tabs in the scrolling content area (no separate ticket pill)", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
    // The interactive status pill is no longer shown in the panel header.
    expect(screen.queryByTestId("ticket-key")).not.toBeInTheDocument();
  });

  it("exposes the open-full action in the more-menu and a close action in the bar", () => {
    render(<SidePanel {...defaultProps} />);
    // The full-view link now lives in the more-menu rather than the bar.
    fireEvent.click(screen.getByLabelText("More actions"));
    expect(screen.getByText("Open full view")).toBeInTheDocument();
    // Two closes exist: the in-bar one (scrolls away) and the floating fallback.
    expect(screen.getAllByLabelText("Close panel").length).toBeGreaterThan(0);
  });

  it("renders the optional drag handle in the bar when provided (BRDG-336)", () => {
    render(<SidePanel {...defaultProps} dragHandle={<button aria-label="Drag PROJ-1 to a refinement session" />} />);
    expect(screen.getByLabelText("Drag PROJ-1 to a refinement session")).toBeInTheDocument();
  });

  it("renders no drag handle when the prop is omitted (sprint board usage unchanged)", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.queryByLabelText(/Drag .* to a refinement session/)).not.toBeInTheDocument();
  });

  it("offers the story writer from the more menu (not a standalone bar button)", () => {
    render(<SidePanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    expect(screen.getByTestId("more-menu")).toHaveTextContent("Open story writer");
  });

  it("renders the tabbed content area on the content tab", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("tab-content")).toBeInTheDocument();
    expect(screen.getByTestId("active-tab")).toHaveTextContent("content");
  });

  describe("default tab (BRDG-326)", () => {
    it("defaults a non-epic ticket to the content tab", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "story" })} />);
      expect(screen.getByTestId("active-tab")).toHaveTextContent("content");
    });

    it("defaults an epic to the leading child issues tab", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "epic" })} />);
      expect(screen.getByTestId("active-tab")).toHaveTextContent("children");
    });

    it("re-defaults the tab when the displayed ticket is swapped", () => {
      const { rerender } = render(
        <SidePanel {...defaultProps} ticket={makeTicket({ key: "PROJ-1", type: "epic" })} />,
      );
      expect(screen.getByTestId("active-tab")).toHaveTextContent("children");
      rerender(<SidePanel {...defaultProps} ticket={makeTicket({ key: "PROJ-2", type: "story" })} />);
      expect(screen.getByTestId("active-tab")).toHaveTextContent("content");
    });
  });

  it("renders the shared meta panel (stacked under content at narrow width)", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("meta-content")).toBeInTheDocument();
  });

  it("opens the more-actions menu with follow/pull/flag actions", () => {
    render(<SidePanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    const menu = screen.getByTestId("more-menu");
    expect(menu).toHaveTextContent("Follow ticket");
    expect(menu).toHaveTextContent("Pull from Jira");
    expect(menu).toHaveTextContent("Flag this ticket");
  });

  describe("add-to-refinement visibility", () => {
    // Availability mirrors the board row / bulk menus: any live ticket not
    // already in a session, regardless of readiness.
    it("offers add-to-refinement for a not-yet-ready ticket", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ readiness: "drafting", jiraStatus: "IN PROGRESS" })} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).toHaveTextContent("Add to refinement");
    });

    it.each(["DONE", "DEPRECATED"] as const)("hides add-to-refinement for %s tickets", (jiraStatus) => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ jiraStatus })} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).not.toHaveTextContent("Add to refinement");
    });

    it("hides add-to-refinement for a ticket removed from Jira", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ removedFromJiraAt: "2026-06-01" })} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).not.toHaveTextContent("Add to refinement");
    });

    it("hides add-to-refinement when the ticket is already in an active session", () => {
      refinementSessionsValue = [{ id: "s1", status: "draft", ticketKeys: ["PROJ-42"] }];
      render(<SidePanel {...defaultProps} ticket={makeTicket({ key: "PROJ-42" })} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).not.toHaveTextContent("Add to refinement");
    });
  });

  it("omits the Review item from the more-menu for subtasks (BRDG-333)", () => {
    const { unmount } = render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "story" })} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    expect(screen.getByTestId("more-menu")).toHaveTextContent("Review");
    unmount();

    render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "subtask" })} />);
    fireEvent.click(screen.getByLabelText("More actions"));
    expect(screen.getByTestId("more-menu")).not.toHaveTextContent("Review");
  });

  describe("generate test doc (BRDG-426)", () => {
    it("offers 'Generate test doc' when no doc exists and passes view=false", () => {
      const onGenerateTestDoc = vi.fn();
      render(<SidePanel {...defaultProps} ticket={makeTicket({ key: "PROJ-42", testDocState: null })} onGenerateTestDoc={onGenerateTestDoc} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      fireEvent.click(screen.getByText("Generate test doc"));
      expect(onGenerateTestDoc).toHaveBeenCalledWith("PROJ-42", false);
    });

    it.each(["draft", "accepted"] as const)("reads 'View test doc' and passes view=true once a %s doc exists", (testDocState) => {
      const onGenerateTestDoc = vi.fn();
      render(<SidePanel {...defaultProps} ticket={makeTicket({ key: "PROJ-42", testDocState })} onGenerateTestDoc={onGenerateTestDoc} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.queryByText("Generate test doc")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("View test doc"));
      expect(onGenerateTestDoc).toHaveBeenCalledWith("PROJ-42", true);
    });

    it("hides the test-doc item for subtasks", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "subtask" })} onGenerateTestDoc={vi.fn()} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).not.toHaveTextContent("test doc");
    });

    it("hides the test-doc item when no handler is wired (non-board hosts)", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ testDocState: null })} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).not.toHaveTextContent("test doc");
    });
  });

  it("shows a push-to-jira action when there are local edits", () => {
    hookValue = makeHook({ hasLocalTitleEdit: true });
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByLabelText("Push to Jira")).toBeInTheDocument();
  });

  it("shows push for a persisted local edit even when the client flags reset (title-only)", () => {
    // After a remount the client-only edit flags are false, but editState is the
    // persisted truth: a title-only edit must still expose the push action.
    hookValue = makeHook({ hasLocalTitleEdit: false, hasLocalDescEdit: false });
    render(<SidePanel {...defaultProps} ticket={makeTicket({ editState: "local_edits" })} />);
    expect(screen.getByLabelText("Push to Jira")).toBeInTheDocument();
  });

  it("renders without crashing using the ticket prop fallback before the hook resolves", () => {
    hookValue = makeHook({ ticket: undefined });
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByTestId("tab-content")).toBeInTheDocument();
  });

  describe("epic filter actions (BRDG-131)", () => {
    const epicActions = {
      onShowOnly: vi.fn(),
      onShowAcrossAllSprints: vi.fn(),
      onClear: vi.fn(),
      isFiltered: false,
    };

    beforeEach(() => {
      epicActions.onShowOnly.mockClear();
      epicActions.onShowAcrossAllSprints.mockClear();
      epicActions.onClear.mockClear();
    });

    it("shows the epic filter actions in the more-menu for an epic", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "epic", title: "Onboarding" })} epicActions={epicActions} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      const menu = screen.getByTestId("more-menu");
      expect(menu).toHaveTextContent("Show only this epic");
      expect(menu).toHaveTextContent("Show across all sprints");
    });

    it("does not show epic actions for a non-epic ticket", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "story" })} epicActions={epicActions} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).not.toHaveTextContent("Show only this epic");
    });

    it("passes the epic title to the show-only action", () => {
      render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "epic", title: "Onboarding" })} epicActions={epicActions} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      fireEvent.click(screen.getByText("Show only this epic"));
      expect(epicActions.onShowOnly).toHaveBeenCalledWith("Onboarding");
    });

    it("offers Clear only when an epic filter is active", () => {
      const { unmount } = render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "epic" })} epicActions={epicActions} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).not.toHaveTextContent("Clear epic filter");
      unmount();

      render(<SidePanel {...defaultProps} ticket={makeTicket({ type: "epic" })} epicActions={{ ...epicActions, isFiltered: true }} />);
      fireEvent.click(screen.getByLabelText("More actions"));
      expect(screen.getByTestId("more-menu")).toHaveTextContent("Clear epic filter");
    });
  });

  describe("meta sidebar (collapse / resize / auto-stack)", () => {
    function seed(values: Record<string, string>) {
      for (const [k, v] of Object.entries(values)) window.localStorage.setItem(k, v);
    }

    it("renders the meta as its own column (not stacked) when the panel is wide", () => {
      seed({ sprintBoardPanelWidth: "1100" });
      render(<SidePanel {...defaultProps} />);
      // Column mode: meta rendered with its collapse control, and NOT injected
      // under the Content tab.
      expect(screen.getByTestId("meta-content")).toBeInTheDocument();
      expect(screen.getByLabelText("Collapse sidebar")).toBeInTheDocument();
      expect(screen.queryByTestId("tab-has-meta")).not.toBeInTheDocument();
    });

    it("stacks the meta under the content when the panel is too narrow", () => {
      seed({ sprintBoardPanelWidth: "400" });
      render(<SidePanel {...defaultProps} />);
      expect(screen.getByTestId("tab-has-meta")).toBeInTheDocument();
      expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
    });

    it("stacks when content + chosen meta width no longer fit side by side", () => {
      seed({ sprintBoardPanelWidth: "600", sprintBoardMetaWidth: "340" });
      render(<SidePanel {...defaultProps} />);
      expect(screen.getByTestId("tab-has-meta")).toBeInTheDocument();
      expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
    });

    it("stacks the meta below the content when collapsed (instead of hiding it), even when wide", () => {
      seed({ sprintBoardPanelWidth: "1100", sprintBoardMetaCollapsed: "true" });
      render(<SidePanel {...defaultProps} />);
      // Collapsed: no side column, but the meta is still rendered, stacked
      // under the Content tab in a single scroll.
      expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
      expect(screen.getByTestId("tab-has-meta")).toBeInTheDocument();
      expect(screen.getByTestId("meta-content")).toBeInTheDocument();
    });

    it("shows a 'Show sidebar' header button only when collapsed and wide enough for a column", () => {
      seed({ sprintBoardPanelWidth: "1100" });
      render(<SidePanel {...defaultProps} />);
      expect(screen.queryByLabelText("Show sidebar")).not.toBeInTheDocument();

      window.localStorage.clear();
      seed({ sprintBoardPanelWidth: "1100", sprintBoardMetaCollapsed: "true" });
      render(<SidePanel {...defaultProps} />);
      expect(screen.getByLabelText("Show sidebar")).toBeInTheDocument();
    });

    it("suppresses the 'Show sidebar' toggle when too narrow for a meta column (BRDG)", () => {
      // 800px no longer fits a column (content would dip below CONTENT_MIN_WIDTH),
      // so the meta stays stacked under the content and the toggle (which would
      // only re-stack the same panel) is hidden. This breakpoint moved up: a column
      // now needs a panel ~940px+, not ~640px.
      seed({ sprintBoardPanelWidth: "800", sprintBoardMetaCollapsed: "true" });
      render(<SidePanel {...defaultProps} />);
      expect(screen.queryByLabelText("Show sidebar")).not.toBeInTheDocument();
      expect(screen.getByTestId("tab-has-meta")).toBeInTheDocument();
      expect(screen.getByTestId("meta-content")).toBeInTheDocument();
    });

    it("collapsing via the divider button persists the state and stacks the meta below content", () => {
      seed({ sprintBoardPanelWidth: "1100" });
      render(<SidePanel {...defaultProps} />);
      fireEvent.click(screen.getByLabelText("Collapse sidebar"));
      expect(window.localStorage.getItem("sprintBoardMetaCollapsed")).toBe("true");
      // No longer a side column, but stacked under the content (still visible).
      expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
      expect(screen.getByTestId("tab-has-meta")).toBeInTheDocument();
      expect(screen.getByLabelText("Show sidebar")).toBeInTheDocument();
    });

    it("the header 'Show sidebar' button restores the side column and persists the state", () => {
      seed({ sprintBoardPanelWidth: "1100", sprintBoardMetaCollapsed: "true" });
      render(<SidePanel {...defaultProps} />);
      // Collapsed -> stacked, so no side column yet.
      expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Show sidebar"));
      expect(window.localStorage.getItem("sprintBoardMetaCollapsed")).toBe("false");
      // Restored as a resizable side column (no longer stacked under content).
      expect(screen.getByLabelText("Collapse sidebar")).toBeInTheDocument();
      expect(screen.queryByTestId("tab-has-meta")).not.toBeInTheDocument();
    });

    // The meta resize handle is scoped via the collapse button's parent so it is
    // never confused with the panel's own outer-edge resize handle.
    function metaHandle() {
      const column = screen.getByLabelText("Collapse sidebar").parentElement as HTMLElement;
      return column.querySelector(".cursor-col-resize") as HTMLElement;
    }

    it("double-clicking the resize handle collapses the meta", () => {
      seed({ sprintBoardPanelWidth: "1100" });
      render(<SidePanel {...defaultProps} />);
      const handle = metaHandle();
      expect(handle).toBeTruthy();
      fireEvent.doubleClick(handle);
      expect(window.localStorage.getItem("sprintBoardMetaCollapsed")).toBe("true");
    });

    it("dragging the resize handle persists a (clamped) meta width", () => {
      seed({ sprintBoardPanelWidth: "1100" });
      render(<SidePanel {...defaultProps} />);
      const handle = metaHandle();
      fireEvent.mouseDown(handle);
      // jsdom getBoundingClientRect is all-zero, so the computed width clamps to
      // the floor; the assertion verifies the persisted value, not the exact px.
      fireEvent.mouseMove(document, { clientX: 100 });
      fireEvent.mouseUp(document);
      expect(window.localStorage.getItem("sprintBoardMetaWidth")).toBe("280");
    });
  });

  describe("in-panel back navigation (BRDG-456)", () => {
    it("drills into a linked item in place and reveals a back control to the previous item", () => {
      render(<SidePanel {...defaultProps} enableBackNavigation ticket={makeTicket({ key: "PROJ-42" })} />);
      // No back affordance until the user has drilled in.
      expect(screen.queryByLabelText(/^Back to/)).not.toBeInTheDocument();
      expect(screen.getByTestId("current-key")).toHaveTextContent("PROJ-42");

      fireEvent.click(screen.getByTestId("drill"));

      // The panel now shows the drilled item and offers a step back to the origin.
      expect(screen.getByTestId("current-key")).toHaveTextContent("PROJ-99");
      expect(screen.getAllByLabelText("Back to PROJ-42").length).toBeGreaterThan(0);
    });

    it("steps back to the previous item and hides the back control at the root", () => {
      render(<SidePanel {...defaultProps} enableBackNavigation ticket={makeTicket({ key: "PROJ-42" })} />);
      fireEvent.click(screen.getByTestId("drill"));
      expect(screen.getByTestId("current-key")).toHaveTextContent("PROJ-99");

      fireEvent.click(screen.getAllByLabelText("Back to PROJ-42")[0]);

      expect(screen.getByTestId("current-key")).toHaveTextContent("PROJ-42");
      expect(screen.queryByLabelText(/^Back to/)).not.toBeInTheDocument();
    });

    it("keeps Close dismissing the whole panel even after drilling in", () => {
      const onClose = vi.fn();
      render(<SidePanel {...defaultProps} onClose={onClose} enableBackNavigation ticket={makeTicket({ key: "PROJ-42" })} />);
      fireEvent.click(screen.getByTestId("drill"));
      fireEvent.click(screen.getAllByLabelText("Close panel")[0]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not drill in place when back navigation is off (host owns selection)", () => {
      const onSelectTicket = vi.fn();
      render(<SidePanel {...defaultProps} onSelectTicket={onSelectTicket} ticket={makeTicket({ key: "PROJ-42" })} />);
      fireEvent.click(screen.getByTestId("drill"));
      // The key is delegated to the host; the panel neither swaps nor shows a back control.
      expect(onSelectTicket).toHaveBeenCalledWith("PROJ-99");
      expect(screen.getByTestId("current-key")).toHaveTextContent("PROJ-42");
      expect(screen.queryByLabelText(/^Back to/)).not.toBeInTheDocument();
    });

    it("resets the back-stack when the host opens a different ticket", () => {
      const { rerender } = render(<SidePanel {...defaultProps} enableBackNavigation ticket={makeTicket({ key: "PROJ-42" })} />);
      fireEvent.click(screen.getByTestId("drill"));
      expect(screen.getAllByLabelText("Back to PROJ-42").length).toBeGreaterThan(0);

      // Host selects a new entry point: the drill-down history is discarded.
      rerender(<SidePanel {...defaultProps} enableBackNavigation ticket={makeTicket({ key: "PROJ-7" })} />);
      expect(screen.getByTestId("current-key")).toHaveTextContent("PROJ-7");
      expect(screen.queryByLabelText(/^Back to/)).not.toBeInTheDocument();
    });

    it("records the drilled item as viewed", () => {
      render(<SidePanel {...defaultProps} enableBackNavigation ticket={makeTicket({ key: "PROJ-42" })} />);
      fireEvent.click(screen.getByTestId("drill"));
      expect(readRecentlyViewed()[0]).toMatchObject({ key: "PROJ-99" });
    });
  });

  describe("recently viewed recording (BRDG-330)", () => {
    it("records the ticket as viewed when the panel opens", () => {
      render(<SidePanel {...defaultProps} />);
      expect(readRecentlyViewed()[0]).toMatchObject({ key: "PROJ-42", title: "Test ticket title" });
    });

    it("records the new ticket when the panel switches tickets", () => {
      const { rerender } = render(<SidePanel {...defaultProps} />);
      rerender(<SidePanel {...defaultProps} ticket={makeTicket({ key: "PROJ-43", title: "Next ticket" })} />);
      expect(readRecentlyViewed().map((e) => e.key)).toEqual(["PROJ-43", "PROJ-42"]);
    });
  });
});
