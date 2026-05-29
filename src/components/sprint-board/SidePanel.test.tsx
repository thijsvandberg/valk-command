import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SidePanel } from "./SidePanel";
import type { Ticket } from "@/types/ticket";

vi.mock("lucide-react", () => {
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

vi.mock("@/components/shared/TicketKeyPill", () => ({
  TicketKeyPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="ticket-key">{ticketKey}</span>,
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
    jiraStatus: "IN PROGRESS",
    issueType: "Story",
    storyPoints: 5,
    businessValue: 3,
    assignee: { name: "Alice", avatar: null, color: "#abc" },
    epic: "Epic One",
    sprintId: "1",
    rank: "0|1",
    qualityScore: 85,
    readiness: "drafting",
    poStatus: "Draft",
    labels: ["frontend"],
    editState: null,
    poNotes: "Some notes",
    notes: "PO notes here",
    isRemoved: false,
    lastChanged: "2026-01-01T10:00:00Z",
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

  it("renders story points badge", () => {
    render(<SidePanel {...defaultProps} />);
    expect(screen.getByText("5 pts")).toBeInTheDocument();
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
