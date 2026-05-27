import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionTicketView } from "./SessionTicketView";
import type { Ticket, TicketDetail } from "@/types/ticket";

// Mock child components so tests focus on SessionTicketView wiring
vi.mock("@/components/ticket-detail/EditableTitle", () => ({
  EditableTitle: (props: Record<string, unknown>) => {
    const { ticketKey, initialTitle, serverLocalEdit, onLocalEdit, onViewDiff } = props;
    return (
      <div data-testid="editable-title">
        <span data-testid="title-key">{ticketKey as string}</span>
        <span data-testid="title-value">{initialTitle as string}</span>
        {serverLocalEdit ? (
          <span data-testid="title-server-local-edit">
            {(serverLocalEdit as { value: string }).value}
          </span>
        ) : null}
        <button data-testid="title-notify-edit" onClick={() => (onLocalEdit as (v: boolean) => void)(true)}>
          notify edit
        </button>
        {onViewDiff ? (
          <button data-testid="title-view-diff" onClick={onViewDiff as () => void}>view diff</button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("@/components/ticket-detail/EditableDescription", () => ({
  EditableDescription: (props: Record<string, unknown>) => {
    const {
      ticketKey, initialDescription, serverLocalEdit, onLocalEdit,
      onDiscard, onPushToJira, isPushing, pushError,
      showConflictWarning, overrideConfirmed, onOverrideChange, onViewDiff,
    } = props;
    return (
      <div data-testid="editable-description">
        <span data-testid="desc-key">{ticketKey as string}</span>
        <span data-testid="desc-value">{initialDescription as string}</span>
        {serverLocalEdit ? (
          <span data-testid="desc-server-local-edit">
            {(serverLocalEdit as { value: string }).value}
          </span>
        ) : null}
        {isPushing ? <span data-testid="desc-pushing">pushing</span> : null}
        {pushError ? <span data-testid="desc-push-error">{pushError as string}</span> : null}
        {showConflictWarning ? <span data-testid="desc-conflict">conflict</span> : null}
        {overrideConfirmed ? <span data-testid="desc-override-confirmed">override</span> : null}
        <button data-testid="desc-notify-edit" onClick={() => (onLocalEdit as (v: boolean) => void)(true)}>
          notify edit
        </button>
        {onDiscard ? (
          <button data-testid="desc-discard" onClick={onDiscard as () => void}>discard</button>
        ) : null}
        {onPushToJira ? (
          <button data-testid="desc-push" onClick={onPushToJira as () => void}>push</button>
        ) : null}
        {onOverrideChange ? (
          <button data-testid="desc-override-change" onClick={() => (onOverrideChange as (v: boolean) => void)(true)}>
            override change
          </button>
        ) : null}
        {onViewDiff ? (
          <button data-testid="desc-view-diff" onClick={onViewDiff as () => void}>view diff</button>
        ) : null}
      </div>
    );
  },
}));

vi.mock("@/components/ticket-detail/SubtasksSection", () => ({
  SubtasksSection: () => <div data-testid="subtasks-section" />,
}));

vi.mock("@/components/ticket-detail/LinkedIssuesSection", () => ({
  LinkedIssuesSection: () => <div data-testid="linked-issues-section" />,
}));

vi.mock("@/components/ticket-detail/ConfluencePagesSection", () => ({
  ConfluencePagesSection: () => <div data-testid="confluence-section" />,
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (v: string) => v,
}));

vi.mock("@/lib/api-client", () => ({
  tickets: { saveLocalEdit: vi.fn(), addJiraComment: vi.fn() },
  jira: { moveSprint: vi.fn() },
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [] }),
}));

vi.mock("@/lib/jira-url", () => ({
  getJiraUrl: (key: string) => `https://jira.example.com/browse/${key}`,
}));

vi.mock("@/lib/date-utils", () => ({
  relativeDate: () => "1 day ago",
  formatAbsoluteDate: () => "2026-05-27",
}));

function makeTicket(overrides?: Partial<Ticket>): Ticket {
  return {
    key: "VPL-100",
    title: "Test ticket",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: 3,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    sprintId: undefined,
    removedFromJiraAt: null,
    ...overrides,
  };
}

function makeDetail(overrides?: Partial<TicketDetail>): TicketDetail {
  return {
    description: "Original description",
    reporter: null,
    parent: null,
    labels: [],
    components: [],
    priority: "Medium",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    attachments: [],
    subtasks: [],
    linkedIssues: [],
    jiraComments: [],
    epicChildren: [],
    ...overrides,
  };
}

describe("SessionTicketView", () => {
  const defaultProps = {
    ticket: makeTicket(),
    detail: makeDetail(),
    onMutate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes serverLocalEdit to EditableDescription when localEdits provided", () => {
    render(
      <SessionTicketView
        {...defaultProps}
        localEdits={{
          description: { value: "edited desc", isDraft: false },
        }}
      />,
    );
    expect(screen.getByTestId("desc-server-local-edit")).toHaveTextContent("edited desc");
  });

  it("passes serverLocalEdit to EditableTitle when localEdits provided", () => {
    render(
      <SessionTicketView
        {...defaultProps}
        localEdits={{
          title: { value: "edited title", isDraft: false },
        }}
      />,
    );
    expect(screen.getByTestId("title-server-local-edit")).toHaveTextContent("edited title");
  });

  it("passes isPushing and pushError to EditableDescription", () => {
    render(
      <SessionTicketView
        {...defaultProps}
        isPushing={true}
        pushError="Something went wrong"
        onPushToJira={vi.fn()}
      />,
    );
    expect(screen.getByTestId("desc-pushing")).toBeInTheDocument();
    expect(screen.getByTestId("desc-push-error")).toHaveTextContent("Something went wrong");
  });

  it("calls onPushToJira when push button clicked in EditableDescription", () => {
    const onPush = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        onPushToJira={onPush}
      />,
    );
    fireEvent.click(screen.getByTestId("desc-push"));
    expect(onPush).toHaveBeenCalledTimes(1);
  });

  it("calls onDiscard when discard clicked in EditableDescription", () => {
    const onDiscard = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.click(screen.getByTestId("desc-discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("shows conflict warning banner when showConflictWarning is true", () => {
    render(
      <SessionTicketView
        {...defaultProps}
        showConflictWarning={true}
        onDiscard={vi.fn()}
        onViewDiff={vi.fn()}
      />,
    );
    expect(screen.getByText("Jira version changed since your last sync")).toBeInTheDocument();
    expect(screen.getByText("Accept Jira version")).toBeInTheDocument();
    expect(screen.getByText("Review diff")).toBeInTheDocument();
  });

  it("does not show conflict warning banner when showConflictWarning is false", () => {
    render(
      <SessionTicketView
        {...defaultProps}
        showConflictWarning={false}
      />,
    );
    expect(screen.queryByText("Jira version changed since your last sync")).not.toBeInTheDocument();
  });

  it("calls onDiscard when Accept Jira version button is clicked", () => {
    const onDiscard = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        showConflictWarning={true}
        onDiscard={onDiscard}
        onViewDiff={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Accept Jira version"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("calls onViewDiff when Review diff button is clicked", () => {
    const onViewDiff = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        showConflictWarning={true}
        onDiscard={vi.fn()}
        onViewDiff={onViewDiff}
      />,
    );
    fireEvent.click(screen.getByText("Review diff"));
    expect(onViewDiff).toHaveBeenCalledTimes(1);
  });

  it("passes conflict and override state to EditableDescription", () => {
    render(
      <SessionTicketView
        {...defaultProps}
        showConflictWarning={true}
        overrideConfirmed={true}
        onOverrideChange={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByTestId("desc-conflict")).toBeInTheDocument();
    expect(screen.getByTestId("desc-override-confirmed")).toBeInTheDocument();
  });

  it("calls onOverrideChange from EditableDescription", () => {
    const onOverrideChange = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        onOverrideChange={onOverrideChange}
      />,
    );
    fireEvent.click(screen.getByTestId("desc-override-change"));
    expect(onOverrideChange).toHaveBeenCalledWith(true);
  });

  it("calls onLocalTitleEdit when title edit is notified", () => {
    const onLocalTitleEdit = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        onLocalTitleEdit={onLocalTitleEdit}
      />,
    );
    fireEvent.click(screen.getByTestId("title-notify-edit"));
    expect(onLocalTitleEdit).toHaveBeenCalledWith(true);
  });

  it("calls onLocalDescEdit when description edit is notified", () => {
    const onLocalDescEdit = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        onLocalDescEdit={onLocalDescEdit}
      />,
    );
    fireEvent.click(screen.getByTestId("desc-notify-edit"));
    expect(onLocalDescEdit).toHaveBeenCalledWith(true);
  });

  it("passes onViewDiff to EditableTitle and EditableDescription", () => {
    const onViewDiff = vi.fn();
    render(
      <SessionTicketView
        {...defaultProps}
        onViewDiff={onViewDiff}
      />,
    );
    fireEvent.click(screen.getByTestId("title-view-diff"));
    expect(onViewDiff).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("desc-view-diff"));
    expect(onViewDiff).toHaveBeenCalledTimes(2);
  });
});
