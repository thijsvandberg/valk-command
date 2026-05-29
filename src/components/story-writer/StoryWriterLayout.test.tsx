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

vi.mock("./panes/ApplicationListBar", () => ({
  ApplicationListBar: () => <div data-testid="application-list-bar" />,
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
    writerContextValue: {},
    initialEditorOpen: true,
    isDraftDirty: false,
    saving: false,
    showSaved: false,
    pushing: false,
    pulling: false,
    hasPushed: false,
    hasLocalSave: false,
    showMoreMenu: false,
    setShowMoreMenu: vi.fn(),
    showDeleteConfirm: false,
    setShowDeleteConfirm: vi.fn(),
    showRefinePrompt: false,
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
    handleSaveDraft: vi.fn(),
    handlePush: vi.fn(),
    handlePushAndClose: vi.fn(),
    handleCloseAfterPush: vi.fn(),
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

  it("shows save draft button when draft is dirty", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: { id: "s1", localTitle: "Draft", localDraft: "content" },
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });
    (useStoryWriterActions as ReturnType<typeof vi.fn>).mockReturnValue({
      ...makeDefaultActions(),
      isDraftDirty: true,
    });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByText("Save draft")).toBeInTheDocument();
  });

  it("shows saved state in save button when showSaved is true", () => {
    (useStoryWriter as ReturnType<typeof vi.fn>).mockReturnValue({
      status: "ready",
      session: { id: "s1", localTitle: "Draft", localDraft: "content" },
      messages: [],
    });
    (useTicketDetail as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, mutate: vi.fn() });
    (useStoryWriterActions as ReturnType<typeof vi.fn>).mockReturnValue({
      ...makeDefaultActions(),
      isDraftDirty: true,
      showSaved: true,
    });

    render(<StoryWriterLayout ticketKey="VPL-1" />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
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
