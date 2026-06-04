import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SidePanel } from "./SidePanel";
import type { Ticket } from "@/types/ticket";

vi.mock("lucide-react", () => {
  const stub = () => null;
  const names = ["Maximize2", "X", "Gem", "NotebookPen", "MoreHorizontal", "Star", "Copy", "Check", "CloudDownload", "CloudUpload", "Flag", "MessageSquare", "Loader2", "Trash2", "ChevronRight", "PanelRightClose"];
  return Object.fromEntries(names.map((n) => [n, stub]));
});

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

vi.mock("@/hooks/useRefinementSessions", () => ({
  useRefinementSessions: () => ({ sessions: [] }),
}));

vi.mock("@/lib/prefetch", () => ({ prefetchTicketPage: vi.fn() }));

// Render the tab content stub so we can assert tabs + the injected meta block.
// `tab-has-meta` marks the stacked layout (meta injected under the Content tab).
// The tabs and the header action buttons now scroll with the content, so they
// live inside this component and only render when SidePanel passes them via
// `renderTabBar` / `tabBarActions`.
vi.mock("@/components/ticket-detail/TicketTabContent", () => ({
  TicketTabContent: ({ activeTab, metaContent, renderTabBar, tabBarActions }: { activeTab: string; metaContent?: React.ReactNode; renderTabBar?: boolean; tabBarActions?: React.ReactNode }) => (
    <div data-testid="tab-content">
      <span data-testid="active-tab">{activeTab}</span>
      {renderTabBar && ["Content", "History", "Review", "Development"].map((label) => <span key={label}>{label}</span>)}
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

  it("exposes the open-full and close actions in the bar", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByLabelText("Open full view")).toBeInTheDocument();
    // Two closes exist: the in-bar one (scrolls away) and the floating fallback.
    expect(screen.getAllByLabelText("Close panel").length).toBeGreaterThan(0);
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

  it("shows a push-to-jira action when there are local edits", () => {
    hookValue = makeHook({ hasLocalTitleEdit: true });
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByLabelText("Push to Jira")).toBeInTheDocument();
  });

  it("renders without crashing using the ticket prop fallback before the hook resolves", () => {
    hookValue = makeHook({ ticket: undefined });
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByTestId("tab-content")).toBeInTheDocument();
  });

  describe("meta sidebar (collapse / resize / auto-stack)", () => {
    function seed(values: Record<string, string>) {
      for (const [k, v] of Object.entries(values)) window.localStorage.setItem(k, v);
    }

    it("renders the meta as its own column (not stacked) when the panel is wide", () => {
      seed({ sprintBoardPanelWidth: "900" });
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
      seed({ sprintBoardPanelWidth: "900", sprintBoardMetaCollapsed: "true" });
      render(<SidePanel {...defaultProps} />);
      // Collapsed: no side column, but the meta is still rendered, stacked
      // under the Content tab in a single scroll.
      expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
      expect(screen.getByTestId("tab-has-meta")).toBeInTheDocument();
      expect(screen.getByTestId("meta-content")).toBeInTheDocument();
    });

    it("shows a 'Show sidebar' header button only when collapsed", () => {
      render(<SidePanel {...defaultProps} />);
      expect(screen.queryByLabelText("Show sidebar")).not.toBeInTheDocument();

      window.localStorage.clear();
      seed({ sprintBoardMetaCollapsed: "true" });
      render(<SidePanel {...defaultProps} />);
      expect(screen.getByLabelText("Show sidebar")).toBeInTheDocument();
    });

    it("collapsing via the divider button persists the state and stacks the meta below content", () => {
      seed({ sprintBoardPanelWidth: "900" });
      render(<SidePanel {...defaultProps} />);
      fireEvent.click(screen.getByLabelText("Collapse sidebar"));
      expect(window.localStorage.getItem("sprintBoardMetaCollapsed")).toBe("true");
      // No longer a side column, but stacked under the content (still visible).
      expect(screen.queryByLabelText("Collapse sidebar")).not.toBeInTheDocument();
      expect(screen.getByTestId("tab-has-meta")).toBeInTheDocument();
      expect(screen.getByLabelText("Show sidebar")).toBeInTheDocument();
    });

    it("the header 'Show sidebar' button restores the side column and persists the state", () => {
      seed({ sprintBoardPanelWidth: "900", sprintBoardMetaCollapsed: "true" });
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
      seed({ sprintBoardPanelWidth: "900" });
      render(<SidePanel {...defaultProps} />);
      const handle = metaHandle();
      expect(handle).toBeTruthy();
      fireEvent.doubleClick(handle);
      expect(window.localStorage.getItem("sprintBoardMetaCollapsed")).toBe("true");
    });

    it("dragging the resize handle persists a (clamped) meta width", () => {
      seed({ sprintBoardPanelWidth: "900" });
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
});
