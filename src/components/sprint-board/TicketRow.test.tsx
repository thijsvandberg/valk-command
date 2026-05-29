import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketRow } from "./TicketRow";
import type { Ticket } from "@/types/ticket";

vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    Flag: stub("flag"), MessageSquare: stub("msg"), Star: stub("star"), Rocket: stub("rocket"),
    GitBranch: stub("branch"), Pencil: stub("pencil"), Check: stub("check"), X: stub("x"), Gem: stub("gem"),
  };
});

vi.mock("@/hooks/useOutsideClick", () => ({ useOutsideClick: vi.fn() }));
vi.mock("@dnd-kit/sortable", () => ({ useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: null, isDragging: false }) }));
vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => "" } } }));
vi.mock("@/components/shared/IssueTypeIcon", () => ({ IssueTypeIcon: () => <span data-testid="type-icon" /> }));
vi.mock("@/components/shared/Avatar", () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock("@/components/sprint-board/TicketTableCells", () => ({
  EditStateDot: () => <span data-testid="edit-dot" />,
  QualityBadge: ({ score }: { score: number | null }) => <span data-testid="quality">{score}</span>,
  POStatusCell: () => <span data-testid="po-status" />,
}));
vi.mock("@/components/shared/Tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/sprint-board/OpenSubtasksIndicator", () => ({ OpenSubtasksIndicator: () => null }));
vi.mock("@/components/shared/BusinessValuePicker", () => ({ BusinessValuePicker: () => <span data-testid="bv-picker" /> }));
vi.mock("@/components/shared/StoryPointPicker", () => ({ StoryPointPicker: () => <span data-testid="sp-picker" /> }));
vi.mock("@/components/shared/TicketStatusPill", () => ({ TicketStatusPill: () => <span data-testid="status-pill" /> }));
vi.mock("@/components/shared/ReadinessCell", () => ({ ReadinessCell: () => <span data-testid="readiness" /> }));
vi.mock("@/lib/prefetch", () => ({ prefetchTicketPage: vi.fn() }));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "PROJ-10",
    title: "Implement feature",
    jiraStatus: "IN PROGRESS",
    issueType: "Story",
    storyPoints: 5,
    businessValue: 3,
    assignee: { name: "Alice", avatar: null, color: "#abc" },
    epic: "Epic One",
    sprintId: "1",
    rank: "0|1",
    qualityScore: 80,
    readiness: "drafting",
    poStatus: "Draft",
    labels: [],
    editState: null,
    poNotes: null,
    notes: "",
    isRemoved: false,
    lastChanged: null,
    ...overrides,
  };
}

const defaultProps = {
  ticket: makeTicket(),
  ticketIdx: 0,
  isChecked: false,
  isSelected: false,
  someChecked: false,
  isDragActive: false,
  selectedTicket: null,
  onSelectTicket: vi.fn(),
  onCheckboxClick: vi.fn(),
  col: () => true,
};

describe("TicketRow", () => {
  it("renders ticket title", () => {
    render(<table><tbody><TicketRow {...defaultProps} /></tbody></table>);
    expect(screen.getByText("Implement feature")).toBeInTheDocument();
  });

  it("shows checked state when isChecked is true", () => {
    const { container } = render(<table><tbody><TicketRow {...defaultProps} isChecked someChecked /></tbody></table>);
    // Checkbox is a styled span with an SVG check when checked
    const checkSvg = container.querySelector("td svg");
    expect(checkSvg).toBeInTheDocument();
  });

  it("calls onSelectTicket when row clicked", () => {
    const onSelectTicket = vi.fn();
    render(<table><tbody><TicketRow {...defaultProps} onSelectTicket={onSelectTicket} /></tbody></table>);
    fireEvent.click(screen.getByText("Implement feature"));
    expect(onSelectTicket).toHaveBeenCalledWith("PROJ-10");
  });

  it("renders row for removed ticket without error", () => {
    const { container } = render(
      <table><tbody><TicketRow {...defaultProps} ticket={makeTicket({ isRemoved: true })} /></tbody></table>,
    );
    const row = container.querySelector("tr");
    expect(row).toBeInTheDocument();
  });

  it("calls onCheckboxClick when checkbox cell clicked", () => {
    const onCheckboxClick = vi.fn();
    const { container } = render(<table><tbody><TicketRow {...defaultProps} someChecked onCheckboxClick={onCheckboxClick} /></tbody></table>);
    // Checkbox is the first td with the styled span
    const checkboxCell = container.querySelector("td.cursor-pointer");
    expect(checkboxCell).toBeInTheDocument();
    fireEvent.click(checkboxCell!);
    expect(onCheckboxClick).toHaveBeenCalledWith("PROJ-10", 0, false);
  });
});
