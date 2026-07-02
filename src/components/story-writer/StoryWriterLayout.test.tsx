import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StoryWriterLayout } from "./StoryWriterLayout";

// Mock hooks
vi.mock("@/hooks/useStoryWriter", () => ({
  useStoryWriter: vi.fn(),
}));

vi.mock("@/hooks/useDraftSync", () => ({
  useDraftSync: vi.fn(),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: vi.fn(),
  useTicketReviews: vi.fn(),
  useJiraSprints: vi.fn(),
}));

vi.mock("./useStoryWriterActions", () => ({
  useStoryWriterActions: vi.fn(),
}));

// Mock pane/writer providers and their children
vi.mock("./panes/PaneContext", () => ({
  PaneProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePaneContext: vi.fn(),
}));

vi.mock("./panes/WriterContext", () => ({
  WriterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWriterContext: vi.fn(),
}));

// The real AppsMenu reads paneApps/paneVisible, which the thin usePaneContext
// mock below does not provide.
vi.mock("./panes/AppsMenu", () => ({
  AppsMenu: () => <button data-testid="apps-menu">Apps</button>,
}));

vi.mock("./panes/AppToolbar", () => ({
  AppToolbar: () => <div data-testid="app-toolbar" />,
}));

vi.mock("./panes/PaneArea", () => ({
  PaneArea: () => <div data-testid="pane-area" />,
}));

vi.mock("@/components/shared/ViewHeader", () => ({
  ViewHeader: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <div data-testid="view-header">
      <div data-testid="view-header-children">{children}</div>
      <div data-testid="view-header-actions">{actions}</div>
    </div>
  ),
  ViewHeaderDivider: () => <span data-testid="view-header-divider" />,
}));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ jiraStatus }: { jiraStatus: string }) => (
    <div data-testid="ticket-status-pill">{jiraStatus}</div>
  ),
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: ({ type }: { type: string }) => <span data-testid="issue-type-icon">{type}</span>,
}));

vi.mock("@/components/shared/SprintPicker", () => ({
  SprintPicker: () => <div data-testid="sprint-picker" />,
}));

vi.mock("@/components/shared/EpicPicker", () => ({
  EpicPicker: () => <div data-testid="epic-picker" />,
}));

vi.mock("@/components/shared/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("./SplitStoryPicker", () => ({
  SplitStoryPicker: () => null,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/jira-url", () => ({
  getJiraUrl: (key: string) => `https://jira.example.com/browse/${key}`,
}));

import { useStoryWriter } from "@/hooks/useStoryWriter";
import { useDraftSync } from "@/hooks/useDraftSync";
import { useTicketDetail, useTicketReviews, useJiraSprints } from "@/hooks/useSprintBoard";
import { useStoryWriterActions } from "./useStoryWriterActions";
import { useWriterContext } from "./panes/WriterContext";
import { usePaneContext } from "./panes/PaneContext";

function makeDefaultActions() {
  return {
    moreMenuRef: { current: null },
    wrapUpMenuRef: { current: null },
    writerContextValue: {},
    initialEditorOpen: true,
    isDraftDirty: false,
    pushing: false,
    pulling: false,
    showMoreMenu: false,
    setShowMoreMenu: vi.fn(),
    showWrapUpMenu: false,
    setShowWrapUpMenu: vi.fn(),
    showDeleteConfirm: false,
    setShowDeleteConfirm: vi.fn(),
    showSplitPicker: false,
    setShowSplitPicker: vi.fn(),
    showAddToRefinement: false,
    setShowAddToRefinement: vi.fn(),
    splitModeVisible: false,
    targetTicketKey: null,
    splitButtonLabel: "Split story",
    pushError: null,
    ticketSprintId: null,
    ticketAsTicket: null,
    localReadiness: null,
    handlePush: vi.fn(),
    handleWrapUpReady: vi.fn(),
    handleWrapUpReadyClear: vi.fn(),
    handleWrapUpClose: vi.fn(),
    handleAddToRefinementClose: vi.fn(),
    handlePullFromJira: vi.fn().mockResolvedValue(undefined),
    handleDelete: vi.fn(),
    handleSplitButtonClick: vi.fn(),
    handleSplitConfirm: vi.fn().mockResolvedValue(undefined),
    handleJiraStatusChange: vi.fn(),
    handleReadinessChange: vi.fn().mockResolvedValue(undefined),
    handleTypeChange: vi.fn(),
    handleEpicChange: vi.fn(),
    handleSprintChange: vi.fn(),
    handleFlagChange: vi.fn().mockResolvedValue(undefined),
    effectiveKey: "VPL-1",
  };
}

function makeWriter(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    session: { id: "s1", localTitle: "My Story", localDraft: "" },
    messages: [],
    draftSaveState: "idle",
    draftConflict: false,
    resolveDraftConflict: vi.fn(),
    ...overrides,
  };
}

describe("StoryWriterLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useDraftSync as ReturnType<typeof vi.fn>).mockReturnValue({
      realKey: null,
      syncStatus: "idle",
      error: null,
      retry: vi.fn(),
    });

    (useTicketReviews as ReturnType<typeof vi.fn>).mockReturnValue({ data: null });
    (useJiraSprints as ReturnType<typeof vi.fn>).mockReturnValue({ sprints: [] });
    (useStoryWriterActions as ReturnType<typeof vi.fn>).mockReturnValue(makeDefaultActions());

    // These are called inside SplitModeSync which uses WriterContext and PaneContext
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue({
      splitModeVisible: false,
      targetTicketKey: null,
    });
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue({
      openApp: vi.fn(),
      closeApp: vi.fn(),
    });
  });

  it("shows spinner while status is loading", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "loading",
      session: null,
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    // Should render a loading spinner, not the header
    expect(screen.queryByTestId("view-header")).not.toBeInTheDocument();
  });

  it("renders the layout after loading completes", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: { id: "s1", localTitle: "My Story", localDraft: "" },
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByTestId("view-header")).toBeInTheDocument();
    expect(screen.getByTestId("pane-area")).toBeInTheDocument();
  });

  it("displays ticket title from session localTitle", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: { id: "s1", localTitle: "My Story Title", localDraft: "" },
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByText("My Story Title")).toBeInTheDocument();
  });

  it("displays ticket status pill when ticket data is present", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: { id: "s1", localTitle: null, localDraft: "" },
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        title: "Ticket Title",
        type: "story",
        jiraStatus: "IN PROGRESS",
        sprintId: null,
        epicKey: null,
        flagged: false,
      },
      mutate: vi.fn(),
    });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByTestId("ticket-status-pill")).toBeInTheDocument();
    expect(screen.getByText("Ticket Title")).toBeInTheDocument();
  });

  it("renders no Save draft button and exactly one primary Wrap up action", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue(makeWriter());
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });
    (useStoryWriterActions as ReturnType<typeof vi.fn>).mockReturnValue({
      ...makeDefaultActions(),
      isDraftDirty: true,
    });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.queryByText("Save draft")).not.toBeInTheDocument();
    expect(screen.getAllByText("Wrap up")).toHaveLength(1);
  });

  it("shows the autosave indicator states from the writer", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue(makeWriter({ draftSaveState: "saving" }));
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });

    const { rerender } = render(<StoryWriterLayout ticketKey="VPL-1" />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue(makeWriter({ draftSaveState: "saved" }));
    rerender(<StoryWriterLayout ticketKey="VPL-1" />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows the three wrap-up options when the panel is open", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue(makeWriter());
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });
    const actions = { ...makeDefaultActions(), showWrapUpMenu: true };
    (useStoryWriterActions as ReturnType<typeof vi.fn>).mockReturnValue(actions);

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByText("Ready to refine")).toBeInTheDocument();
    expect(screen.getByText("Ready to refine + clear session")).toBeInTheDocument();
    expect(screen.getByText("Close as-is")).toBeInTheDocument();

    screen.getByText("Ready to refine").closest("button")!.click();
    expect(actions.handleWrapUpReady).toHaveBeenCalled();
  });

  it("shows the cross-tab conflict banner with Reload and Overwrite actions", () => {
    const resolveDraftConflict = vi.fn();
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue(
      makeWriter({ draftConflict: true, resolveDraftConflict }),
    );
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByText(/changed in another tab/)).toBeInTheDocument();
    screen.getByText("Reload draft").click();
    expect(resolveDraftConflict).toHaveBeenCalledWith("reload");
    screen.getByText("Overwrite").click();
    expect(resolveDraftConflict).toHaveBeenCalledWith("overwrite");
  });

  it("offers the plain push in the overflow menu, disabled when nothing is unpushed", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue(makeWriter());
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });
    (useStoryWriterActions as ReturnType<typeof vi.fn>).mockReturnValue({
      ...makeDefaultActions(),
      showMoreMenu: true,
      isDraftDirty: false,
    });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    const pushItem = screen.getByText("Push to Jira (stay open)").closest("button")!;
    expect(pushItem).toBeDisabled();
  });

  it("shows push error banner when pushError is set", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: null,
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });
    (useStoryWriterActions as ReturnType<typeof vi.fn>).mockReturnValue({
      ...makeDefaultActions(),
      pushError: "Push failed: unauthorized",
    });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByText("Push failed: unauthorized")).toBeInTheDocument();
  });

  it("renders the Apps dropdown in the header actions, before Wrap up (BRDG-460)", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue(makeWriter());
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    const appsMenu = screen.getByTestId("apps-menu");
    expect(screen.getByTestId("view-header-actions")).toContainElement(appsMenu);
    const wrapUp = screen.getByText("Wrap up");
    expect(
      appsMenu.compareDocumentPosition(wrapUp) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("app-toolbar")).toBeInTheDocument();
  });

  it("renders the Apps dropdown for a still-draft ticket where Wrap up is absent (BRDG-460)", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: { id: "s1", localTitle: null, localDraft: "" },
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });

    render(<StoryWriterLayout ticketKey="DRAFT-1" draftTitle="New Story" draftType="story" />);

    expect(screen.getByTestId("apps-menu")).toBeInTheDocument();
    expect(screen.queryByText("Wrap up")).not.toBeInTheDocument();
  });

  it("shows draftType icon for a still-draft ticket", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: { id: "s1", localTitle: null, localDraft: "" },
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });
    (useDraftSync as ReturnType<typeof vi.fn>).mockReturnValue({
      realKey: null,
      syncStatus: "idle",
      error: null,
      retry: vi.fn(),
    });

    render(<StoryWriterLayout ticketKey="DRAFT-1" draftTitle="New Story" draftType="story" />);

    expect(screen.getByTestId("issue-type-icon")).toBeInTheDocument();
  });
});
