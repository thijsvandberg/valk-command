import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionTicketView, SessionMetadataPanel } from "./SessionTicketView";
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

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { firstName: "Test", lastName: "User", imageUrl: null } }),
}));

vi.mock("@clerk/shared/react", () => ({
  useUser: () => ({ user: { firstName: "Test", lastName: "User", imageUrl: null } }),
}));

vi.mock("@/lib/api-client", () => ({
  tickets: {
    saveLocalEdit: vi.fn(),
    addJiraComment: vi.fn(),
    updateStoryPoints: vi.fn().mockResolvedValue({}),
    updateMetadata: vi.fn().mockResolvedValue({}),
    updateEpic: vi.fn().mockResolvedValue({}),
    updateLabels: vi.fn().mockResolvedValue({}),
  },
  jira: {
    moveSprint: vi.fn().mockResolvedValue({}),
    assign: vi.fn().mockResolvedValue({}),
  },
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

vi.mock("@/components/shared/StoryPointPicker", () => ({
  StoryPointPicker: ({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) => (
    <button data-testid="story-point-picker" onClick={() => onChange(5)}>SP: {value ?? "none"}</button>
  ),
}));

vi.mock("@/components/shared/BusinessValuePicker", () => ({
  BusinessValuePicker: ({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) => (
    <button data-testid="business-value-picker" onClick={() => onChange(8)}>BV: {value ?? "none"}</button>
  ),
}));

vi.mock("@/components/shared/AssigneePicker", () => ({
  AssigneePicker: ({ onChange }: { value: unknown; onChange: (v: { accountId: string; displayName: string; avatarUrl: string | null } | null) => void }) => (
    <button data-testid="assignee-picker" onClick={() => onChange({ accountId: "user-1", displayName: "Jane Doe", avatarUrl: null })}>Assignee</button>
  ),
}));

vi.mock("@/components/shared/EpicPicker", () => ({
  EpicPicker: ({ onChange }: { value: unknown; onChange: (v: { key: string; name: string } | null) => void }) => (
    <button data-testid="epic-picker" onClick={() => onChange({ key: "EPIC-1", name: "My Epic" })}>Epic</button>
  ),
}));

vi.mock("@/components/shared/LabelPicker", () => ({
  LabelPicker: ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
    <button data-testid="label-picker" onClick={() => onChange([...value, "new-label"])}>Labels: {value.join(", ")}</button>
  ),
}));

vi.mock("@/components/shared/SprintPicker", () => ({
  SprintPicker: ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
    <button data-testid="sprint-picker" onClick={() => onChange("sprint-2")}>Sprint: {value ?? "none"}</button>
  ),
}));

vi.mock("@/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode; content: string }) => <>{children}</>,
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

describe("SessionMetadataPanel", () => {
  const onMutate = vi.fn();

  const baseTicket = makeTicket({
    storyPoints: 3,
    businessValue: 5,
    jiraStatus: "TO DO",
    epic: "My Epic",
    epicKey: "EPIC-1",
    assignee: { name: "John Doe", initials: "JD", color: "hsl(200, 55%, 50%)" },
    sprintId: "sprint-1",
  });

  const baseDetail = makeDetail({
    reporter: { name: "Reporter Name", initials: "RN", color: "hsl(100, 55%, 50%)" },
    labels: ["bug", "frontend"],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all editable pickers", () => {
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    expect(screen.getByTestId("story-point-picker")).toBeInTheDocument();
    expect(screen.getByTestId("business-value-picker")).toBeInTheDocument();
    expect(screen.getByTestId("assignee-picker")).toBeInTheDocument();
    expect(screen.getByTestId("epic-picker")).toBeInTheDocument();
    expect(screen.getByTestId("label-picker")).toBeInTheDocument();
    expect(screen.getByTestId("sprint-picker")).toBeInTheDocument();
  });

  it("renders status badge as read-only text", () => {
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    expect(screen.getByText("TO DO")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders reporter as read-only text", () => {
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    expect(screen.getByText("Reporter Name")).toBeInTheDocument();
  });

  it("renders created and updated as read-only text", () => {
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    const dates = screen.getAllByText("1 day ago");
    expect(dates.length).toBe(2);
  });

  it("does not render Priority or Components fields", () => {
    render(
      <SessionMetadataPanel
        ticket={baseTicket}
        detail={makeDetail({ priority: "High", components: ["backend"] })}
        onMutate={onMutate}
      />,
    );

    expect(screen.queryByText("Priority")).not.toBeInTheDocument();
    expect(screen.queryByText("Components")).not.toBeInTheDocument();
  });

  it("calls tickets.updateStoryPoints when story point picker changes", async () => {
    const { tickets: ticketsMock } = await import("@/lib/api-client");
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    fireEvent.click(screen.getByTestId("story-point-picker"));
    expect(ticketsMock.updateStoryPoints).toHaveBeenCalledWith("VPL-100", 5);
  });

  it("calls tickets.updateMetadata when business value picker changes", async () => {
    const { tickets: ticketsMock } = await import("@/lib/api-client");
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    fireEvent.click(screen.getByTestId("business-value-picker"));
    expect(ticketsMock.updateMetadata).toHaveBeenCalledWith("VPL-100", { businessValue: 8 });
  });

  it("calls jira.assign when assignee picker changes", async () => {
    const { jira: jiraMock } = await import("@/lib/api-client");
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    fireEvent.click(screen.getByTestId("assignee-picker"));
    expect(jiraMock.assign).toHaveBeenCalledWith({
      issueKey: "VPL-100",
      accountId: "user-1",
      name: "Jane Doe",
    });
  });

  it("calls tickets.updateEpic when epic picker changes", async () => {
    const { tickets: ticketsMock } = await import("@/lib/api-client");
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    fireEvent.click(screen.getByTestId("epic-picker"));
    expect(ticketsMock.updateEpic).toHaveBeenCalledWith("VPL-100", "EPIC-1");
  });

  it("calls tickets.updateLabels when label picker changes", async () => {
    const { tickets: ticketsMock } = await import("@/lib/api-client");
    render(<SessionMetadataPanel ticket={baseTicket} detail={baseDetail} onMutate={onMutate} />);

    fireEvent.click(screen.getByTestId("label-picker"));
    expect(ticketsMock.updateLabels).toHaveBeenCalledWith("VPL-100", ["bug", "frontend", "new-label"]);
  });

  it("hides epic picker for subtasks", () => {
    render(
      <SessionMetadataPanel
        ticket={makeTicket({ ...baseTicket, type: "subtask" })}
        detail={baseDetail}
        onMutate={onMutate}
      />,
    );

    expect(screen.queryByTestId("epic-picker")).not.toBeInTheDocument();
  });
});
