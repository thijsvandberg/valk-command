import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RefinementTicketList } from "./RefinementTicketList";
import type { Ticket } from "@/types/ticket";

vi.mock("@/hooks/useOutsideClick", () => ({
  useOutsideClick: vi.fn(),
}));

vi.mock("@/hooks/useSectionVisibility", () => ({
  useSectionVisibility: () => ({
    visible: new Set(["issueType", "key", "status", "epic", "subtasks", "sp", "bv", "sprint"]),
    toggleField: vi.fn(),
  }),
}));

vi.mock("@/components/ticket-detail/ChildIssueRow", () => ({
  ChildIssueRow: ({ item, isChecked, isActive, someChecked, onCheckboxClick, onSelect, dragHandleSlot }: { item: Ticket; isChecked: boolean; isActive: boolean; someChecked?: boolean; onCheckboxClick: (e: { shiftKey: boolean }) => void; onSelect: (key: string, e: { metaKey: boolean; ctrlKey: boolean }) => void; dragHandleSlot?: React.ReactNode }) => (
    <div data-testid={`ticket-row-${item.key}`} data-selected={isChecked} data-active={isActive}>
      {/* Mirrors the real ChildIssueRow guard: the handle is hidden during multiselect. */}
      {dragHandleSlot && !someChecked && dragHandleSlot}
      <button onClick={() => onSelect?.(item.key, { metaKey: false, ctrlKey: false })}>{item.title}</button>
      <button onClick={() => onCheckboxClick?.({ shiftKey: false })}>Toggle {item.key}</button>
    </div>
  ),
}));

vi.mock("./RefinementFilters", () => ({
  RefinementFilters: () => <div data-testid="refinement-filters" />,
}));

function makeTicket(key: string, title: string): Ticket {
  return {
    key,
    title,
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
  };
}

function makeFilters(overrides: Record<string, unknown> = {}) {
  return {
    filtersOpen: false,
    setFiltersOpen: vi.fn(),
    hideEstimated: false,
    setHideEstimated: vi.fn(),
    epicFilter: new Set<string>(),
    setEpicFilter: vi.fn(),
    lastUpdatedFilter: "4w",
    setLastUpdatedFilter: vi.fn(),
    lastUpdatedOpen: false,
    setLastUpdatedOpen: vi.fn(),
    sprintFilterOpen: false,
    setSprintFilterOpen: vi.fn(),
    effectiveSprintFilter: new Set<string>(),
    toggleSprintInFilter: vi.fn(),
    sprintFilterLabel: "All",
    lastUpdatedLabel: "4 weeks",
    activeFilterCount: 0,
    ...overrides,
  };
}

function makeQueueHook(overrides: Record<string, unknown> = {}) {
  return {
    queue: [] as string[],
    toggleTicket: vi.fn(),
    readyCount: 0,
    allReadySelected: false,
    handleToggleReadyToRefine: vi.fn(),
    ...overrides,
  };
}

type AnyFilters = any;
type AnyQueueHook = any;

const defaultProps = {
  availableTickets: [] as Ticket[],
  searchQuery: "",
  onSearchChange: vi.fn(),
  filters: makeFilters() as AnyFilters,
  queueHook: makeQueueHook() as AnyQueueHook,
  onSelectTicket: vi.fn(),
  pinnedSprintIds: new Set<string>(),
  epicOptions: [] as string[],
  sprintNameMap: {} as Record<string, string>,
  ticketSessionMap: new Map<string, { id: string; name: string }[]>(),
  resolvedSessionId: null as string | null,
};

describe("RefinementTicketList", () => {
  it("renders the heading", () => {
    render(<RefinementTicketList {...defaultProps} />);
    expect(screen.getByText("Select tickets")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<RefinementTicketList {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search tickets...")).toBeInTheDocument();
  });

  it("renders a ticket row for each available ticket", () => {
    const tickets = [makeTicket("VPL-1", "Ticket One"), makeTicket("VPL-2", "Ticket Two")];
    render(<RefinementTicketList {...defaultProps} availableTickets={tickets} />);
    expect(screen.getByTestId("ticket-row-VPL-1")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-row-VPL-2")).toBeInTheDocument();
    expect(screen.getByText("Ticket One")).toBeInTheDocument();
    expect(screen.getByText("Ticket Two")).toBeInTheDocument();
  });

  it("shows empty state when no tickets match", () => {
    render(<RefinementTicketList {...defaultProps} availableTickets={[]} />);
    expect(screen.getByText("No tickets match the current filters.")).toBeInTheDocument();
  });

  it("shows search-specific empty state when search query is set", () => {
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={[]}
        searchQuery="foobar"
      />,
    );
    expect(screen.getByText(/No tickets match/)).toBeInTheDocument();
    expect(screen.getByText(/foobar/)).toBeInTheDocument();
  });

  it("calls onSearchChange when search input changes", () => {
    const onSearchChange = vi.fn();
    render(<RefinementTicketList {...defaultProps} onSearchChange={onSearchChange} />);
    const input = screen.getByPlaceholderText("Search tickets...");
    fireEvent.change(input, { target: { value: "my query" } });
    expect(onSearchChange).toHaveBeenCalledWith("my query");
  });

  it("shows clear button when search query is set and clears on click", () => {
    const onSearchChange = vi.fn();
    render(
      <RefinementTicketList
        {...defaultProps}
        searchQuery="some query"
        onSearchChange={onSearchChange}
      />,
    );
    // X button is present when searchQuery is set
    const clearButton = screen.getByRole("button", { name: "" });
    // Find the clear button by looking for the X icon sibling to the input
    const input = screen.getByPlaceholderText("Search tickets...");
    // Clear button is the sibling button after the input
    const container = input.parentElement!;
    const xButton = Array.from(container.querySelectorAll("button")).find(
      (b) => !b.title && b.children.length > 0,
    );
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("marks a ticket as selected when it is in the queue", () => {
    const tickets = [makeTicket("VPL-1", "Ticket One")];
    const queueHook = makeQueueHook({ queue: ["VPL-1"] });
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={tickets}
        queueHook={queueHook as AnyQueueHook}
      />,
    );
    expect(screen.getByTestId("ticket-row-VPL-1")).toHaveAttribute("data-selected", "true");
  });

  it("marks the row matching previewTicketKey as active, distinct from the checked state", () => {
    const tickets = [makeTicket("VPL-1", "Ticket One"), makeTicket("VPL-2", "Ticket Two")];
    const queueHook = makeQueueHook({ queue: ["VPL-1"] });
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={tickets}
        queueHook={queueHook as AnyQueueHook}
        previewTicketKey="VPL-2"
      />,
    );
    // VPL-2 is open in the sidebar (active) but not queued (not checked).
    expect(screen.getByTestId("ticket-row-VPL-2")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("ticket-row-VPL-2")).toHaveAttribute("data-selected", "false");
    // VPL-1 is queued (checked) but not the open ticket (not active).
    expect(screen.getByTestId("ticket-row-VPL-1")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("ticket-row-VPL-1")).toHaveAttribute("data-selected", "true");
  });

  it("can mark a row as both active and checked", () => {
    const tickets = [makeTicket("VPL-1", "Ticket One")];
    const queueHook = makeQueueHook({ queue: ["VPL-1"] });
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={tickets}
        queueHook={queueHook as AnyQueueHook}
        previewTicketKey="VPL-1"
      />,
    );
    expect(screen.getByTestId("ticket-row-VPL-1")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("ticket-row-VPL-1")).toHaveAttribute("data-selected", "true");
  });

  it("marks no row active when previewTicketKey is null (sidebar closed)", () => {
    const tickets = [makeTicket("VPL-1", "Ticket One")];
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={tickets}
        previewTicketKey={null}
      />,
    );
    expect(screen.getByTestId("ticket-row-VPL-1")).toHaveAttribute("data-active", "false");
  });

  it("calls toggleTicket when the checkbox is clicked (queue control unchanged)", () => {
    const toggleTicket = vi.fn();
    const tickets = [makeTicket("VPL-1", "Ticket One")];
    const queueHook = makeQueueHook({ queue: [], toggleTicket });
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={tickets}
        queueHook={queueHook as AnyQueueHook}
      />,
    );
    fireEvent.click(screen.getByText("Toggle VPL-1"));
    expect(toggleTicket).toHaveBeenCalledWith("VPL-1", 0, false);
  });

  it("opens the side panel (onSelectTicket) on row click without toggling the queue", () => {
    const toggleTicket = vi.fn();
    const onSelectTicket = vi.fn();
    const tickets = [makeTicket("VPL-1", "Ticket One")];
    const queueHook = makeQueueHook({ queue: [], toggleTicket });
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={tickets}
        queueHook={queueHook as AnyQueueHook}
        onSelectTicket={onSelectTicket}
      />,
    );
    fireEvent.click(screen.getByText("Ticket One"));
    expect(onSelectTicket).toHaveBeenCalledWith("VPL-1");
    expect(toggleTicket).not.toHaveBeenCalled();
  });

  it("shows the ready-to-refine badge when readyCount > 0", () => {
    const queueHook = makeQueueHook({ readyCount: 3, allReadySelected: false });
    render(
      <RefinementTicketList
        {...defaultProps}
        queueHook={queueHook as AnyQueueHook}
      />,
    );
    expect(screen.getByText("3 ready to refine")).toBeInTheDocument();
  });

  it("calls handleToggleReadyToRefine when ready badge is clicked", () => {
    const handleToggleReadyToRefine = vi.fn();
    const queueHook = makeQueueHook({ readyCount: 2, allReadySelected: false, handleToggleReadyToRefine });
    render(
      <RefinementTicketList
        {...defaultProps}
        queueHook={queueHook as AnyQueueHook}
      />,
    );
    fireEvent.click(screen.getByText("2 ready to refine"));
    expect(handleToggleReadyToRefine).toHaveBeenCalled();
  });

  it("does not show ready badge when readyCount is 0", () => {
    render(<RefinementTicketList {...defaultProps} />);
    expect(screen.queryByText(/ready to refine/)).not.toBeInTheDocument();
  });

  it("renders a drag handle per row, even while tickets are checked into the queue", () => {
    const tickets = [makeTicket("VPL-1", "Ticket One"), makeTicket("VPL-2", "Ticket Two")];
    const queueHook = makeQueueHook({ queue: ["VPL-1"] });
    render(
      <RefinementTicketList
        {...defaultProps}
        availableTickets={tickets}
        queueHook={queueHook as AnyQueueHook}
      />,
    );
    expect(screen.getByLabelText("Drag VPL-1 to a refinement session")).toBeInTheDocument();
    expect(screen.getByLabelText("Drag VPL-2 to a refinement session")).toBeInTheDocument();
  });

  it("shows RefinementFilters when filtersOpen is true", () => {
    const filters = makeFilters({ filtersOpen: true });
    render(
      <RefinementTicketList
        {...defaultProps}
        filters={filters as AnyFilters}
      />,
    );
    expect(screen.getByTestId("refinement-filters")).toBeInTheDocument();
  });

  it("hides RefinementFilters when filtersOpen is false", () => {
    render(<RefinementTicketList {...defaultProps} />);
    expect(screen.queryByTestId("refinement-filters")).not.toBeInTheDocument();
  });

  it("calls setFiltersOpen when filter toggle button is clicked", () => {
    const setFiltersOpen = vi.fn();
    const filters = makeFilters({ filtersOpen: false, setFiltersOpen });
    render(
      <RefinementTicketList
        {...defaultProps}
        filters={filters as AnyFilters}
      />,
    );
    fireEvent.click(screen.getByTitle("Toggle filters"));
    expect(setFiltersOpen).toHaveBeenCalledWith(true);
  });
});
