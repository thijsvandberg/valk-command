import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SidePanel } from "./SidePanel";
import type { Ticket } from "@/types/ticket";

vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    ArrowUpRight: stub("arrow"),
    X: stub("x"),
    AlertCircle: stub("alert"),
    ChevronRight: stub("chevron-right"),
    ChevronDown: stub("chevron-down"),
    History: stub("history"),
    CheckSquare: stub("check-square"),
    MessageSquare: stub("message-square"),
    Play: stub("play"),
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) => (
    <a href={href as string} {...rest}>{children as React.ReactNode}</a>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ onClick, children, ...rest }: Record<string, unknown>) => (
    <button onClick={onClick as () => void}>{rest.icon as React.ReactNode}{children as React.ReactNode}</button>
  ),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: () => ({ data: { description: "Test description with acceptance criteria section" } }),
  useTicketVersions: () => ({ data: [] }),
  useJiraSprints: () => ({ sprints: [{ id: 1, name: "Sprint 1" }] }),
  useDevInfo: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/lib/prefetch", () => ({
  prefetchTicketPage: vi.fn(),
}));

vi.mock("@/components/shared/Avatar", () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

vi.mock("./TicketTableCells", () => ({
  QualityBadge: ({ score }: { score: number | null }) => <span data-testid="quality-badge">{score}</span>,
}));

vi.mock("@/components/shared/ReadinessCell", () => ({
  ReadinessCell: () => <span data-testid="readiness-cell" />,
}));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="ticket-key">{ticketKey}</span>,
}));

vi.mock("@/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/shared/Tag", () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ticket-detail/DevPanel", () => ({
  DevPanel: () => <div data-testid="dev-panel" />,
}));

vi.mock("@/components/ticket-detail/ConfluencePagesSection", () => ({
  ConfluencePagesSection: () => null,
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (md: string) => md,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  tickets: {
    updateMetadata: vi.fn(),
    updateStoryPoints: vi.fn(),
    updateEpic: vi.fn(),
    updateLabels: vi.fn(),
  },
  jira: {
    assign: vi.fn(),
    moveSprint: vi.fn(),
  },
}));

vi.mock("@/components/ticket-detail/EditableDescription", () => ({
  EditableDescription: ({ initialDescription }: { initialDescription: string }) => (
    <div data-testid="editable-description">{initialDescription}</div>
  ),
}));

vi.mock("@/components/shared/StoryPointPicker", () => ({
  StoryPointPicker: ({ value }: { value: number | null }) => <span data-testid="sp-picker">{value}</span>,
}));

vi.mock("@/components/shared/BusinessValuePicker", () => ({
  BusinessValuePicker: ({ value }: { value: number | null }) => <span data-testid="bv-picker">{value}</span>,
}));

vi.mock("@/components/shared/AssigneePicker", () => ({
  AssigneePicker: ({ value }: { value: { name: string } | null }) => <span data-testid="assignee-picker">{value?.name}</span>,
}));

vi.mock("@/components/shared/SprintPicker", () => ({
  SprintPicker: ({ value }: { value: string | null }) => <span data-testid="sprint-picker">{value}</span>,
}));

vi.mock("@/components/shared/EpicPicker", () => ({
  EpicPicker: ({ value }: { value: { name: string } | null }) => <span data-testid="epic-picker">{value?.name}</span>,
}));

vi.mock("@/components/shared/LabelPicker", () => ({
  LabelPicker: ({ value }: { value: string[] }) => <span data-testid="label-picker">{value.join(",")}</span>,
}));

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

  it("renders ticket key and title", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("ticket-key")).toHaveTextContent("PROJ-42");
    expect(screen.getByText("Test ticket title")).toBeInTheDocument();
  });

  it("renders story points and business value score cards", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("5");
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("3");
  });

  it("renders the editable description", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("editable-description")).toBeInTheDocument();
  });

  it("shows conflict indicator when editState is conflict", () => {
    render(<SidePanel {...defaultProps} ticket={makeTicket({ editState: "conflict" })} />);
    expect(screen.getByText("Conflict")).toBeInTheDocument();
  });

  it("shows draft badge when editState is draft", () => {
    render(<SidePanel {...defaultProps} ticket={makeTicket({ editState: "draft" })} />);
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("renders quality badge", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByTestId("quality-badge")).toBeInTheDocument();
  });
});
