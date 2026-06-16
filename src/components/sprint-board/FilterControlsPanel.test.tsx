import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterControlsPanel, type FilterControlsPanelProps } from "./FilterControlsPanel";

// SWR feeds favourite-assignee ordering; default to no users so ordering is identity.
vi.mock("swr", () => ({ default: () => ({ data: { users: [] } }) }));

// Keep the heavy option renderers as identifiable stubs -- the panel's job is to
// route the verbatim renderer per category, not to re-style it (BRDG-344).
vi.mock("@/components/shared/StatusOption", () => ({
  StatusOption: ({ value }: { value: string }) => <span data-testid={`status-opt-${value}`}>{value}</span>,
}));
vi.mock("@/components/shared/ReadinessOption", () => ({
  ReadinessOption: ({ value }: { value: string }) => <span data-testid={`readiness-opt-${value}`}>{value}</span>,
}));
vi.mock("@/components/shared/IssueTypeOption", () => ({
  IssueTypeOption: ({ value }: { value: string }) => <span data-testid={`type-opt-${value}`}>{value}</span>,
}));
vi.mock("@/components/shared/IssueMetaBadges", () => ({
  EpicBadge: ({ epic }: { epic: string }) => <span data-testid={`epic-badge-${epic}`}>{epic}</span>,
}));
vi.mock("@/components/shared/Avatar", () => ({
  Avatar: () => <span data-testid="avatar" />,
}));
vi.mock("@/components/shared/AssigneePicker", () => ({
  userInitials: (n: string) => n.slice(0, 2),
  userColor: () => "#000",
}));
vi.mock("@/components/sprint-board/BoardFieldToggle", () => ({
  BoardFieldList: ({ onReset }: { onReset?: () => void }) => (
    <div data-testid="board-field-list">
      <button onClick={onReset}>field-list-reset</button>
    </div>
  ),
}));

function makeProps(overrides: Partial<FilterControlsPanelProps> = {}): FilterControlsPanelProps {
  return {
    statusFilter: new Set(),
    epicFilter: new Set(),
    assigneeFilter: new Set(),
    readinessFilter: new Set(),
    editStateFilter: new Set(),
    issueTypeFilter: new Set(),
    gapsFilter: new Set(),
    teamFilter: new Set(),
    sprintFilter: new Set(),
    onStatusFilterChange: vi.fn(),
    onEpicFilterChange: vi.fn(),
    onAssigneeFilterChange: vi.fn(),
    onReadinessFilterChange: vi.fn(),
    onEditStateFilterChange: vi.fn(),
    onIssueTypeFilterChange: vi.fn(),
    onGapsFilterChange: vi.fn(),
    onTeamFilterChange: vi.fn(),
    onSprintFilterChange: vi.fn(),
    statusOptions: ["TO DO", "DONE"],
    epicOptions: ["Logging", "Rooms"],
    assigneeOptions: ["Alice", "Bob"],
    issueTypeOptions: ["Story", "Bug"],
    teamOptions: ["Platform"],
    sprintOptions: ["5995", "6001"],
    sprintNameMap: { "5995": "BT: 138", "6001": "BT: 139" },
    onClearAll: vi.fn(),
    columnVisible: new Set(),
    onColumnToggle: vi.fn(),
    onColumnReset: vi.fn(),
    ...overrides,
  };
}

describe("FilterControlsPanel (BRDG-344)", () => {
  it("opens on Status and renders styled status options", () => {
    render(<FilterControlsPanel {...makeProps()} />);
    expect(screen.getByTestId("status-opt-TO DO")).toBeTruthy();
    expect(screen.getByTestId("status-opt-DONE")).toBeTruthy();
  });

  it("switches category via the rail and renders that category's badges", () => {
    render(<FilterControlsPanel {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Epic/ }));
    expect(screen.getByTestId("epic-badge-Logging")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Type/ }));
    expect(screen.getByTestId("type-opt-Story")).toBeTruthy();
  });

  it("toggles a selection and calls the category's onChange with the updated set", () => {
    const onStatusFilterChange = vi.fn();
    render(<FilterControlsPanel {...makeProps({ onStatusFilterChange })} />);
    fireEvent.click(screen.getByTestId("status-opt-DONE"));
    expect(onStatusFilterChange).toHaveBeenCalledWith(new Set(["DONE"]));
  });

  it("filters options via the per-category search (Epic)", () => {
    render(<FilterControlsPanel {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Epic/ }));
    fireEvent.change(screen.getByPlaceholderText("Search epics..."), { target: { value: "room" } });
    expect(screen.getByTestId("epic-badge-Rooms")).toBeTruthy();
    expect(screen.queryByTestId("epic-badge-Logging")).toBeNull();
  });

  it("resets the per-category search when switching categories", () => {
    render(<FilterControlsPanel {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Epic/ }));
    fireEvent.change(screen.getByPlaceholderText("Search epics..."), { target: { value: "room" } });
    fireEvent.click(screen.getByRole("button", { name: /^Assignee/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Epic/ }));
    // Search field cleared, so both epics are back.
    expect(screen.getByTestId("epic-badge-Logging")).toBeTruthy();
    expect(screen.getByTestId("epic-badge-Rooms")).toBeTruthy();
  });

  it("shows the Sprint leading 'By state' options and hides them while searching", () => {
    render(<FilterControlsPanel {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sprint/ }));
    expect(screen.getByText("By state")).toBeTruthy();
    expect(screen.getByText("Active sprints")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search sprints..."), { target: { value: "138" } });
    expect(screen.queryByText("By state")).toBeNull();
  });

  it("shows a per-category count on the rail and a total in the header", () => {
    render(<FilterControlsPanel {...makeProps({ statusFilter: new Set(["TO DO"]), epicFilter: new Set(["Logging", "Rooms"]) })} />);
    // Header total = 3 (1 status + 2 epic).
    const header = screen.getByText("Filters").parentElement!;
    expect(within(header).getByText("3")).toBeTruthy();
    // Rail shows the Epic category's own count of 2.
    expect(within(screen.getByRole("button", { name: /^Epic/ })).getByText("2")).toBeTruthy();
  });

  it("Clear all clears filters only (not field visibility)", () => {
    const onClearAll = vi.fn();
    const onColumnReset = vi.fn();
    render(<FilterControlsPanel {...makeProps({ statusFilter: new Set(["TO DO"]), onClearAll, onColumnReset })} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onColumnReset).not.toHaveBeenCalled();
  });

  it("renders a Reporter category only when its props are supplied, and toggles it (BRDG-358)", () => {
    // Absent by default (board does not pass reporter props).
    render(<FilterControlsPanel {...makeProps()} />);
    expect(screen.queryByRole("button", { name: /^Reporter/ })).toBeNull();

    const onCreatorFilterChange = vi.fn();
    render(
      <FilterControlsPanel
        {...makeProps({ creatorFilter: new Set(), onCreatorFilterChange, creatorOptions: ["Alice", "Bob"] })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Reporter/ }));
    fireEvent.click(screen.getByText("Alice"));
    expect(onCreatorFilterChange).toHaveBeenCalledWith(new Set(["Alice"]));
  });

  it("limits the rail to the category whitelist, in order (BRDG-357 inbox)", () => {
    render(
      <FilterControlsPanel
        {...makeProps({ categoryWhitelist: ["status", "epic", "assignee", "type", "team", "sprint"] })}
      />,
    );
    // Whitelisted categories present...
    expect(screen.getByRole("button", { name: /^Status/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Type/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Sprint/ })).toBeTruthy();
    // ...excluded categories gone.
    expect(screen.queryByRole("button", { name: /^Readiness/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Changes/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Gaps/ })).toBeNull();
  });

  it("Display toggle swaps to the field list, whose Reset clears visibility only", () => {
    const onClearAll = vi.fn();
    const onColumnReset = vi.fn();
    render(<FilterControlsPanel {...makeProps({ onClearAll, onColumnReset })} />);
    // Swap to Display view (two Display affordances: header label + toggle button).
    fireEvent.click(screen.getAllByText("Display").find((el) => el.closest("button"))!);
    expect(screen.getByTestId("board-field-list")).toBeTruthy();
    fireEvent.click(screen.getByText("field-list-reset"));
    expect(onColumnReset).toHaveBeenCalledTimes(1);
    expect(onClearAll).not.toHaveBeenCalled();
  });
});
