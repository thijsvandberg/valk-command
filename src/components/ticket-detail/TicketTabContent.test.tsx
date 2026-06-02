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
  Tab: ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      data-testid={`tab-${label.toLowerCase()}`}
      aria-selected={active}
      onClick={onClick}
    >
      {label}
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
  const ticket = makeTicket();
  const detail = makeDetail();

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
  });

  describe("content tab", () => {
    it("renders editable title on content tab", () => {
      renderContent("content");
      expect(screen.getByTestId("editable-title")).toBeInTheDocument();
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

    it("renders epic children section for epic tickets", () => {
      const onActiveTabChange = vi.fn();
      const ticket = makeTicket({ type: "epic" });
      const detail = makeDetail();
      render(
        <TicketTabContent
          ticketKey="VPL-1"
          ticket={ticket}
          detail={detail}
          localEdits={undefined}
          activeTab="content"
          onActiveTabChange={onActiveTabChange}
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
        />,
      );
      expect(screen.getByTestId("epic-children-section")).toBeInTheDocument();
      expect(screen.queryByTestId("subtasks-section")).not.toBeInTheDocument();
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
