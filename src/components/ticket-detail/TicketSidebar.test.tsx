import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketSidebar } from "./TicketSidebar";
import type { Ticket, TicketDetail } from "@/types/ticket";

const mockUpdateMetadata = vi.fn();
const mockUpdateStoryPoints = vi.fn();
const mockUpdateEpic = vi.fn();
const mockUpdateLabels = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
    updateStoryPoints: (...args: unknown[]) => mockUpdateStoryPoints(...args),
    updateEpic: (...args: unknown[]) => mockUpdateEpic(...args),
    updateLabels: (...args: unknown[]) => mockUpdateLabels(...args),
  },
  jira: {
    moveSprint: vi.fn().mockResolvedValue({}),
    assign: vi.fn().mockResolvedValue({}),
  },
  swrFetcher: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [] }),
  useSprintSlots: () => ({ data: [] }),
  useDevInfo: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/useLocalStorage", () => ({
  useLocalStorage: (_key: string, initial: unknown) => {
    return [initial, vi.fn()];
  },
}));

vi.mock("@/hooks/useTicketSessionMap", () => ({
  useTicketSessionMap: () => ({ ticketSessionMap: new Map() }),
}));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid={`status-pill-${ticketKey}`} />
  ),
}));

vi.mock("@/components/shared/Avatar", () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

vi.mock("@/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/shared/Tag", () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span data-testid="tag">{children}</span>,
}));

vi.mock("@/components/shared/ReadinessCell", () => ({
  ReadinessCell: ({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) => (
    <button data-testid="readiness-cell" onClick={() => onChange("drafting")}>{String(value)}</button>
  ),
}));

vi.mock("@/components/shared/BusinessValuePicker", () => ({
  BusinessValuePicker: ({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) => (
    <button data-testid="bv-picker" onClick={() => onChange(5)}>{value ?? "None"}</button>
  ),
}));

vi.mock("@/components/shared/StoryPointPicker", () => ({
  StoryPointPicker: ({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) => (
    <button data-testid="sp-picker" onClick={() => onChange(3)}>{value ?? "None"}</button>
  ),
}));

vi.mock("@/components/shared/AssigneePicker", () => ({
  AssigneePicker: ({ value }: { value: unknown; onChange: (v: unknown) => void }) => (
    <span data-testid="assignee-picker">{value ? (value as { name: string }).name : "Unassigned"}</span>
  ),
}));

vi.mock("@/components/shared/WatchersRow", () => ({
  WatchersRow: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="watchers-row">{ticketKey}</span>
  ),
}));

vi.mock("@/components/shared/EpicPicker", () => ({
  EpicPicker: ({ value }: { value: unknown }) => (
    <span data-testid="epic-picker">{value ? (value as { name: string }).name : "No epic"}</span>
  ),
}));

vi.mock("@/components/shared/LabelPicker", () => ({
  LabelPicker: ({ value }: { value: string[] }) => (
    <span data-testid="label-picker">{value.join(", ")}</span>
  ),
}));

vi.mock("@/components/sprint-board/TicketTable", () => ({
  QualityBadge: ({ score }: { score: number }) => <span data-testid="quality-badge">{score}</span>,
}));

vi.mock("@/components/sprint-board/SprintListModal", () => ({
  SprintListModal: () => <div data-testid="sprint-list-modal" />,
}));

vi.mock("@/components/ticket-detail/DevPanel", () => ({
  DevPanel: () => <div data-testid="dev-panel" />,
}));

vi.mock("@/components/ticket-detail/ConfluencePagesSection", () => ({
  ConfluencePagesSection: () => <div data-testid="confluence-section" />,
}));

vi.mock("@/lib/date-utils", () => ({
  relativeDate: () => "2 days ago",
  formatAbsoluteDate: () => "Jan 1, 2024",
}));

vi.mock("@/components/shared/StatusBadge", () => ({
  JIRA_STATUS_COLORS: {
    "TO DO": { bg: "#eee", text: "#333" },
    "IN PROGRESS": { bg: "#eef", text: "#339" },
    "DONE": { bg: "#efe", text: "#363" },
    "TEST": { bg: "#fee", text: "#933" },
    "DEPRECATED": { bg: "#888", text: "#444" },
  },
}));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test ticket",
    type: "story",
    epic: "Test Epic",
    epicKey: "VPL-EPIC",
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
    description: "A ticket description",
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

function renderSidebar(overrides: {
  ticket?: Partial<Ticket>;
  detail?: Partial<TicketDetail> | undefined;
  collapsed?: boolean;
} = {}) {
  const ticket = makeTicket(overrides.ticket);
  const detail = overrides.detail !== undefined ? makeDetail(overrides.detail) : makeDetail();
  const onCollapsedChange = vi.fn();
  const onReadinessChange = vi.fn();

  const result = render(
    <TicketSidebar
      ticket={ticket}
      detail={detail}
      collapsed={overrides.collapsed ?? false}
      onCollapsedChange={onCollapsedChange}
      onReadinessChange={onReadinessChange}
    />,
  );

  return { ...result, onCollapsedChange, onReadinessChange };
}

describe("TicketSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMetadata.mockResolvedValue({});
    mockUpdateStoryPoints.mockResolvedValue({});
    mockUpdateEpic.mockResolvedValue({});
    mockUpdateLabels.mockResolvedValue({});
  });

  it("renders nothing when collapsed", () => {
    const { container } = renderSidebar({ collapsed: true });
    expect(container.firstChild).toBeNull();
  });

  it("renders sidebar when not collapsed", () => {
    renderSidebar();
    expect(screen.getByTestId("sp-picker")).toBeInTheDocument();
    expect(screen.getByTestId("bv-picker")).toBeInTheDocument();
  });

  it("displays Jira status", () => {
    renderSidebar({ ticket: { jiraStatus: "IN PROGRESS" } });
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
  });

  it("renders story point picker", () => {
    renderSidebar({ ticket: { storyPoints: 5 } });
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("5");
  });

  it("renders business value picker", () => {
    renderSidebar({ ticket: { businessValue: 3 } });
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("3");
  });

  it("renders assignee picker", () => {
    renderSidebar();
    expect(screen.getByTestId("assignee-picker")).toBeInTheDocument();
  });

  it("renders DevPanel", () => {
    renderSidebar();
    expect(screen.getByTestId("dev-panel")).toBeInTheDocument();
  });

  it("renders Confluence section", () => {
    renderSidebar();
    expect(screen.getByTestId("confluence-section")).toBeInTheDocument();
  });

  it("calls onCollapsedChange when collapse button is clicked", () => {
    const { onCollapsedChange } = renderSidebar();
    fireEvent.click(screen.getByLabelText("Collapse sidebar"));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("renders quality badge component", () => {
    renderSidebar({ ticket: { qualityScore: 85 } });
    expect(screen.getByTestId("quality-badge")).toBeInTheDocument();
  });

  it("shows parent link when detail has parent", () => {
    renderSidebar({
      detail: {
        parent: {
          key: "VPL-PARENT",
          title: "Parent ticket",
          status: "IN PROGRESS",
          type: "epic",
        },
      },
    });
    expect(screen.getByText("Parent ticket")).toBeInTheDocument();
  });

  it("shows reporter when detail has reporter", () => {
    renderSidebar({
      detail: {
        reporter: { name: "Jane Doe", initials: "JD", color: "#336699" },
      },
    });
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows timestamps when detail is provided", () => {
    renderSidebar({
      detail: {
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
    });
    // relativeDate is mocked to return "2 days ago"
    const relativeLabels = screen.getAllByText("2 days ago");
    expect(relativeLabels.length).toBeGreaterThanOrEqual(2);
  });

  it("shows components as tags", () => {
    renderSidebar({
      detail: { components: ["Frontend", "Backend"] },
    });
    expect(screen.getByText("Frontend")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
  });

  it("opens PO Note section when clicked", () => {
    renderSidebar();
    fireEvent.click(screen.getByText("PO Note"));
    expect(screen.getByPlaceholderText("Quick annotation...")).toBeInTheDocument();
  });

  it("saves PO note on blur", async () => {
    renderSidebar({ ticket: { notes: "" } });
    fireEvent.click(screen.getByText("PO Note"));

    const textarea = screen.getByPlaceholderText("Quick annotation...");
    fireEvent.blur(textarea, { target: { value: "My note" } });

    await waitFor(() => {
      expect(mockUpdateMetadata).toHaveBeenCalled();
    });
  });

  it("shows 'More details' toggle button", () => {
    renderSidebar();
    expect(screen.getByText("More details")).toBeInTheDocument();
  });

  it("expands More section and shows readiness and labels", () => {
    renderSidebar();
    fireEvent.click(screen.getByText("More details"));
    expect(screen.getByTestId("readiness-cell")).toBeInTheDocument();
    expect(screen.getByTestId("label-picker")).toBeInTheDocument();
  });

  it("calls onReadinessChange when readiness picker is interacted with", () => {
    const { onReadinessChange } = renderSidebar();
    fireEvent.click(screen.getByText("More details"));
    fireEvent.click(screen.getByTestId("readiness-cell"));
    expect(onReadinessChange).toHaveBeenCalledWith("drafting");
  });

  it("calls updateStoryPoints when SP picker fires change", async () => {
    renderSidebar({ ticket: { key: "VPL-1" } });
    fireEvent.click(screen.getByTestId("sp-picker"));
    await waitFor(() => {
      expect(mockUpdateStoryPoints).toHaveBeenCalledWith("VPL-1", 3);
    });
  });

  it("calls updateMetadata when BV picker fires change", async () => {
    renderSidebar({ ticket: { key: "VPL-1" } });
    fireEvent.click(screen.getByTestId("bv-picker"));
    await waitFor(() => {
      expect(mockUpdateMetadata).toHaveBeenCalledWith("VPL-1", { businessValue: 5 });
    });
  });

  it("does not show sprint row for epic tickets", () => {
    renderSidebar({ ticket: { type: "epic" } });
    expect(screen.queryByText("Sprint")).not.toBeInTheDocument();
  });

  it("shows sprint row for story tickets", () => {
    renderSidebar({ ticket: { type: "story" } });
    expect(screen.getByText("Sprint")).toBeInTheDocument();
  });
});
