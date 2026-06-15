import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketTabContent } from "./TicketTabContent";
import type { Ticket, TicketDetail } from "@/types/ticket";
import type { TicketTab } from "./TicketTabContent";

// Mock all child components to avoid deep dependency trees
vi.mock("./EditableTitle", () => ({
  EditableTitle: ({ initialTitle }: { initialTitle: string }) => (
    <h1 data-testid="editable-title">{initialTitle}</h1>
  ),
}));

vi.mock("./EditableDescription", () => ({
  EditableDescription: ({ initialDescription }: { initialDescription: string }) => (
    <div data-testid="editable-description">{initialDescription}</div>
  ),
}));

vi.mock("./AttachmentsSection", () => ({
  AttachmentsSection: () => <div data-testid="attachments-section" />,
}));

vi.mock("./SubtasksSection", () => ({
  SubtasksSection: () => <div data-testid="subtasks-section" />,
}));

vi.mock("./LinkedIssuesSection", () => ({
  LinkedIssuesSection: () => <div data-testid="linked-issues-section" />,
}));

vi.mock("./EpicChildrenSection", () => ({
  EpicChildrenSection: () => <div data-testid="epic-children-section" />,
}));

vi.mock("./CommentsSection", () => ({
  CommentsSection: () => <div data-testid="comments-section" />,
}));

vi.mock("@/components/shared/TabBar", () => ({
  Tab: ({ label, active, onClick, badge }: { label: string; active: boolean; onClick: () => void; badge?: number }) => (
    <button
      role="tab"
      data-testid={`tab-${label.toLowerCase()}`}
      aria-selected={active}
      onClick={onClick}
    >
      {label}
      {badge !== undefined && <span data-testid="tab-badge">{badge}</span>}
    </button>
  ),
}));

vi.mock("@/components/shared/Avatar", () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    // Return a simple placeholder component for dynamically loaded tabs
    const DynamicComponent = ({ ticketKey }: { ticketKey?: string }) => (
      <div data-testid="dynamic-tab-content" data-key={ticketKey} />
    );
    DynamicComponent.displayName = "DynamicComponent";
    return DynamicComponent;
  },
}));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test ticket",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    description: "Ticket description",
    reporter: null,
    parent: null,
    labels: [],
    components: [],
    priority: "Medium",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    attachments: [],
    subtasks: [],
    linkedIssues: [],
    jiraComments: [],
    epicChildren: [],
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof TicketTabContent>;

function renderContent(activeTab: TicketTab = "content", overrides: Partial<Props> = {}) {
  const onActiveTabChange = vi.fn();
  const ticket = overrides.ticket ?? makeTicket();
  const detail = overrides.detail ?? makeDetail();

  const result = render(
    <TicketTabContent
      ticketKey="VPL-1"
      ticket={ticket}
      detail={detail}
      localEdits={undefined}
      activeTab={activeTab}
      onActiveTabChange={overrides.onActiveTabChange ?? onActiveTabChange}
      draftDiscardKey={0}
      isTitleEditing={false}
      isDescEditing={false}
      onTitleEditingChange={vi.fn()}
      onDescEditingChange={vi.fn()}
      onTitleLocalEdit={vi.fn()}
      onDescLocalEdit={vi.fn()}
      showConflictWarning={false}
      showConflictDiff={false}
      autoOpenDraftDiff={false}
      metadataOnlyConflict={false}
      onViewDiff={vi.fn()}
      isDiscarding={false}
      discardError={null}
      isPushing={false}
      pushError={null}
      overrideConfirmed={false}
      onOverrideChange={vi.fn()}
      onDiscardDraft={vi.fn().mockResolvedValue(undefined)}
      onPushToJira={vi.fn().mockResolvedValue(undefined)}
      onMutate={vi.fn()}
      onConflictResolved={vi.fn().mockResolvedValue(undefined)}
      onSelectTicket={vi.fn()}
      reviewCount={0}
      versionCount={0}
      historyResetKey={0}
      isFlagged={false}
      {...overrides}
    />,
  );

  return { ...result, onActiveTabChange };
}

describe("TicketTabContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tab bar", () => {
    it("renders all tabs", () => {
      renderContent();
      expect(screen.getByTestId("tab-content")).toBeInTheDocument();
      expect(screen.getByTestId("tab-history")).toBeInTheDocument();
      expect(screen.getByTestId("tab-review")).toBeInTheDocument();
      expect(screen.getByTestId("tab-development")).toBeInTheDocument();
      expect(screen.queryByTestId("tab-refinement")).not.toBeInTheDocument();
    });

    it("marks active tab as selected", () => {
      renderContent("history");
      expect(screen.getByTestId("tab-history")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("tab-content")).toHaveAttribute("aria-selected", "false");
    });

    it("calls onActiveTabChange when a tab is clicked", () => {
      const { onActiveTabChange } = renderContent("content");
      fireEvent.click(screen.getByTestId("tab-history"));
      expect(onActiveTabChange).toHaveBeenCalledWith("history");
    });

    it("does not render a Child issues tab for non-epic tickets", () => {
      renderContent();
      expect(screen.queryByTestId("tab-child issues")).not.toBeInTheDocument();
    });

    it("renders a leading Child issues tab for epic tickets", () => {
      renderContent("children", { ticket: makeTicket({ type: "epic" }) });
      const tabs = screen.getAllByRole("tab");
      // Child issues is the first (leading) tab in the bar.
      expect(tabs[0]).toHaveAttribute("data-testid", "tab-child issues");
      expect(screen.getByTestId("tab-content")).toBeInTheDocument();
    });

    it("omits the Review and Development tabs for epics (not relevant)", () => {
      renderContent("children", { ticket: makeTicket({ type: "epic" }) });
      expect(screen.queryByTestId("tab-review")).not.toBeInTheDocument();
      expect(screen.queryByTestId("tab-development")).not.toBeInTheDocument();
      // History remains available for epics.
      expect(screen.getByTestId("tab-history")).toBeInTheDocument();
    });

    it("keeps the Review and Development tabs for non-epic tickets", () => {
      renderContent("content");
      expect(screen.getByTestId("tab-review")).toBeInTheDocument();
      expect(screen.getByTestId("tab-development")).toBeInTheDocument();
    });

    it("relabels the Content tab as 'Subtask' and omits Review/Development for subtasks (BRDG-333)", () => {
      renderContent("content", { ticket: makeTicket({ type: "subtask" }) });
      expect(screen.getByTestId("tab-subtask")).toBeInTheDocument();
      expect(screen.queryByTestId("tab-content")).not.toBeInTheDocument();
      expect(screen.queryByTestId("tab-review")).not.toBeInTheDocument();
      expect(screen.queryByTestId("tab-development")).not.toBeInTheDocument();
      // History remains available for subtasks.
      expect(screen.getByTestId("tab-history")).toBeInTheDocument();
    });
  });

  describe("epic child issues tab", () => {
    const epicTicket = () => makeTicket({ type: "epic" });

    it("renders the epic children section on the children tab", () => {
      renderContent("children", { ticket: epicTicket() });
      expect(screen.getByTestId("epic-children-section")).toBeInTheDocument();
    });

    it("shows a count badge equal to the number of child issues", () => {
      const detail = makeDetail({
        epicChildren: [
          { key: "VPL-2" } as TicketDetail["epicChildren"][number],
          { key: "VPL-3" } as TicketDetail["epicChildren"][number],
        ],
      });
      renderContent("children", { ticket: epicTicket(), detail });
      const childTab = screen.getByTestId("tab-child issues");
      expect(childTab).toHaveTextContent("2");
    });

    it("hides the count badge when the epic has no children", () => {
      renderContent("children", { ticket: epicTicket(), detail: makeDetail({ epicChildren: [] }) });
      const childTab = screen.getByTestId("tab-child issues");
      expect(childTab).not.toHaveTextContent(/\d/);
    });
  });

  describe("content tab", () => {
    it("renders editable title on content tab", () => {
      renderContent("content");
      expect(screen.getByTestId("editable-title")).toBeInTheDocument();
    });

    it("keeps the title visible while the description is being edited (BRDG)", () => {
      renderContent("content", { isDescEditing: true });
      // The title block must stay rendered and must not carry the `hidden`
      // class while editing the body, so the PO never loses the page title.
      const titleBlock = screen.getByTestId("editable-title").parentElement!.parentElement!;
      expect(titleBlock).not.toHaveClass("hidden");
      expect(titleBlock).toHaveClass("mt-3");
    });

    it("renders editable description on content tab", () => {
      renderContent("content");
      expect(screen.getByTestId("editable-description")).toBeInTheDocument();
    });

    it("renders attachments section on content tab", () => {
      renderContent("content");
      expect(screen.getByTestId("attachments-section")).toBeInTheDocument();
    });

    it("renders subtasks section for non-epic tickets", () => {
      renderContent("content");
      expect(screen.getByTestId("subtasks-section")).toBeInTheDocument();
      expect(screen.queryByTestId("epic-children-section")).not.toBeInTheDocument();
    });

    it("does not render subtasks or epic children on the content tab for epics", () => {
      renderContent("content", { ticket: makeTicket({ type: "epic" }) });
      expect(screen.queryByTestId("subtasks-section")).not.toBeInTheDocument();
      expect(screen.queryByTestId("epic-children-section")).not.toBeInTheDocument();
      // Epic content body still renders title/description on the Content tab.
      expect(screen.getByTestId("editable-description")).toBeInTheDocument();
    });

    it("renders comments section on content tab", () => {
      renderContent("content");
      expect(screen.getByTestId("comments-section")).toBeInTheDocument();
    });

    it("shows conflict warning banner when showConflictWarning is true", () => {
      renderContent("content", { showConflictWarning: true });
      expect(screen.getByText("Conflict")).toBeInTheDocument();
    });

    it("shows flagged banner when isFlagged is true", () => {
      renderContent("content", { isFlagged: true });
      expect(screen.getByText("Flagged")).toBeInTheDocument();
    });

    it("does not show conflict warning when false", () => {
      renderContent("content", { showConflictWarning: false });
      expect(screen.queryByText("Conflict")).not.toBeInTheDocument();
    });
  });

  describe("other tabs", () => {
    it("does not render title/description on history tab", () => {
      renderContent("history");
      expect(screen.queryByTestId("editable-title")).not.toBeInTheDocument();
      expect(screen.queryByTestId("editable-description")).not.toBeInTheDocument();
    });

    it("does not render content sections on review tab", () => {
      renderContent("review");
      expect(screen.queryByTestId("editable-title")).not.toBeInTheDocument();
      expect(screen.queryByTestId("subtasks-section")).not.toBeInTheDocument();
    });

    it("renders the review tab content area", () => {
      renderContent("review");
      expect(screen.getByTestId("dynamic-tab-content")).toBeInTheDocument();
    });
  });

  describe("conflict handling", () => {
    it("shows 'Accept Jira version' button in conflict warning", () => {
      renderContent("content", { showConflictWarning: true });
      expect(screen.getByText("Accept Jira version")).toBeInTheDocument();
    });

    it("shows 'Review diff' button in conflict warning", () => {
      renderContent("content", { showConflictWarning: true });
      expect(screen.getByText("Review diff")).toBeInTheDocument();
    });

    it("calls onDiscardDraft when 'Accept Jira version' is clicked", () => {
      const onDiscardDraft = vi.fn().mockResolvedValue(undefined);
      renderContent("content", { showConflictWarning: true, onDiscardDraft });
      fireEvent.click(screen.getByText("Accept Jira version"));
      expect(onDiscardDraft).toHaveBeenCalled();
    });

    it("navigates to history tab when 'Review diff' is clicked", () => {
      const { onActiveTabChange } = renderContent("content", { showConflictWarning: true });
      fireEvent.click(screen.getByText("Review diff"));
      expect(onActiveTabChange).toHaveBeenCalledWith("history");
    });

    it("shows discard error message when present", () => {
      renderContent("content", { showConflictWarning: true, discardError: "Failed to discard" });
      expect(screen.getByText("Failed to discard")).toBeInTheDocument();
    });
  });
});
