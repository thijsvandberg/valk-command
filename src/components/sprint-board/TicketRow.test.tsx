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
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ hoverData }: { hoverData?: { sprintId: string | null } }) => (
    <span data-testid="status-pill" data-sprint-id={hoverData?.sprintId ?? ""} />
  ),
}));
vi.mock("@/components/shared/ReadinessCell", () => ({ ReadinessCell: () => <span data-testid="readiness" /> }));
vi.mock("@/lib/prefetch", () => ({ prefetchTicketPage: vi.fn() }));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "PROJ-10",
    title: "Implement feature",
    type: "story",
    epicKey: null,
    flagged: false,
    jiraStatus: "IN PROGRESS",
    storyPoints: 5,
    businessValue: 3,
    assignee: { name: "Alice", initials: "A", color: "#abc" },
    epic: "Epic One",
    sprintId: "1",
    qualityScore: 80,
    readiness: "drafting",
    poStatus: "Draft",
    editState: "clean",
    notes: "",
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

  it("passes the ticket's sprint id to the hover card so the picker resolves it", () => {
    // sprintId must be the sprint id (picker matches String(s.id)), not a name
    // lookup that would fail and render "None" while a sprint exists.
    render(<table><tbody><TicketRow {...defaultProps} ticket={makeTicket({ sprintId: "1" })} /></tbody></table>);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-sprint-id", "1");
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
      <table><tbody><TicketRow {...defaultProps} ticket={makeTicket({ removedFromJiraAt: "2026-01-01T00:00:00Z" })} /></tbody></table>,
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

  it("emits onRowContextMenu with the key on right-click and prevents the native menu", () => {
    const onRowContextMenu = vi.fn();
    const { container } = render(<table><tbody><TicketRow {...defaultProps} onRowContextMenu={onRowContextMenu} /></tbody></table>);
    const row = container.querySelector("tr")!;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(row, event);
    expect(onRowContextMenu).toHaveBeenCalledTimes(1);
    expect(onRowContextMenu.mock.calls[0][0]).toBe("PROJ-10");
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not emit onRowContextMenu during an active drag", () => {
    const onRowContextMenu = vi.fn();
    const { container } = render(<table><tbody><TicketRow {...defaultProps} isDragActive onRowContextMenu={onRowContextMenu} /></tbody></table>);
    fireEvent.contextMenu(container.querySelector("tr")!);
    expect(onRowContextMenu).not.toHaveBeenCalled();
  });

  it("does not select the ticket on right-click", () => {
    const onSelectTicket = vi.fn();
    const { container } = render(<table><tbody><TicketRow {...defaultProps} onSelectTicket={onSelectTicket} onRowContextMenu={vi.fn()} /></tbody></table>);
    fireEvent.contextMenu(container.querySelector("tr")!);
    expect(onSelectTicket).not.toHaveBeenCalled();
  });
});
