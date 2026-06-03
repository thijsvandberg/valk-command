import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SidePanel } from "./SidePanel";
import type { Ticket } from "@/types/ticket";

vi.mock("lucide-react", () => {
  const stub = () => null;
  const names = ["ArrowUpRight", "X", "Gem", "NotebookPen", "MoreHorizontal", "Star", "Copy", "Check", "CloudDownload", "CloudUpload", "Flag", "MessageSquare", "Loader2", "Trash2"];
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
vi.mock("@/components/ticket-detail/TicketTabContent", () => ({
  TicketTabContent: ({ activeTab, metaContent }: { activeTab: string; metaContent?: React.ReactNode }) => (
    <div data-testid="tab-content">
      <span data-testid="active-tab">{activeTab}</span>
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
  });

  it("renders the ticket key in the header pill", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("ticket-key")).toHaveTextContent("PROJ-42");
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

  it("uses the ticket prop as a fallback before the hook's detail resolves", () => {
    hookValue = makeHook({ ticket: undefined });
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("ticket-key")).toHaveTextContent("PROJ-42");
  });
});
