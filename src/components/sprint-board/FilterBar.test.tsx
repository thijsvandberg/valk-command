import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterBar } from "./FilterBar";

// Use the real icon set so the mock survives new icon imports pulled in
// transitively (ReadinessCell, Avatar, EpicBadge). The mocked FilterDropdown
// never renders these, so this only needs to satisfy module-level bindings.
vi.mock("lucide-react", async (importOriginal) => await importOriginal());

vi.mock("@/components/shared/FilterDropdown", () => ({
  FilterDropdown: ({ label, onChange, leadingOptions, leadingLabel }: { label: string; onChange: (s: Set<string>) => void; leadingOptions?: { value: string; label: string }[]; leadingLabel?: string }) => (
    <div data-testid={`filter-${label.toLowerCase()}-wrap`}>
      <button data-testid={`filter-${label.toLowerCase()}`} onClick={() => onChange(new Set(["test"]))}>
        {label}
      </button>
      {leadingLabel && <span data-testid={`leading-label-${label.toLowerCase()}`}>{leadingLabel}</span>}
      {leadingOptions?.map((o) => (
        <button key={o.value} data-testid={`leading-${o.value}`} onClick={() => onChange(new Set([o.value]))}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: () => <span data-testid="issue-type-icon" />,
  ISSUE_TYPE_COLORS: {},
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick, title, ...rest }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} title={title as string}>
      {rest.icon as React.ReactNode}
      {children as React.ReactNode}
    </button>
  ),
}));

vi.mock("@/components/shared/BarContainer", () => ({
  BarContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-container">{children}</div>,
  BarDivider: () => <span data-testid="divider" />,
}));

vi.mock("@/components/sprint-board/SaveViewPopover", () => ({
  SaveViewPopover: () => <div data-testid="save-view-popover" />,
}));

vi.mock("@/components/sprint-board/ExpandableSearch", () => ({
  ExpandableSearch: ({ value, onChange }: { value: string; onChange: (q: string) => void }) => (
    <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const defaultProps = {
  statusFilter: new Set<string>(),
  epicFilter: new Set<string>(),
  assigneeFilter: new Set<string>(),
  readinessFilter: new Set<string>(),
  editStateFilter: new Set<string>(),
  issueTypeFilter: new Set<string>(),
  onStatusFilterChange: vi.fn(),
  onEpicFilterChange: vi.fn(),
  onAssigneeFilterChange: vi.fn(),
  onReadinessFilterChange: vi.fn(),
  onEditStateFilterChange: vi.fn(),
  onIssueTypeFilterChange: vi.fn(),
  statusOptions: ["TO DO", "IN PROGRESS", "DONE"],
  epicOptions: ["Epic 1"],
  assigneeOptions: ["Alice"],
  issueTypeOptions: ["Story"],
};

describe("FilterBar", () => {
  it("renders all filter dropdowns", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByTestId("filter-status")).toBeInTheDocument();
    expect(screen.getByTestId("filter-epic")).toBeInTheDocument();
    expect(screen.getByTestId("filter-assignee")).toBeInTheDocument();
    expect(screen.getByTestId("filter-readiness")).toBeInTheDocument();
    expect(screen.getByTestId("filter-changes")).toBeInTheDocument();
    expect(screen.getByTestId("filter-type")).toBeInTheDocument();
  });

  it("does not render Clear button when no filters active", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.queryByTitle("Clear all filters")).not.toBeInTheDocument();
  });

  it("renders Clear button when filters are active", () => {
    render(<FilterBar {...defaultProps} statusFilter={new Set(["TO DO"])} />);
    expect(screen.getByTitle("Clear all filters")).toBeInTheDocument();
  });

  it("clears all filters when Clear clicked", () => {
    const props = {
      ...defaultProps,
      statusFilter: new Set(["TO DO"]),
    };
    render(<FilterBar {...props} />);
    fireEvent.click(screen.getByTitle("Clear all filters"));
    expect(props.onStatusFilterChange).toHaveBeenCalledWith(new Set());
    expect(props.onEpicFilterChange).toHaveBeenCalledWith(new Set());
    expect(props.onAssigneeFilterChange).toHaveBeenCalledWith(new Set());
    expect(props.onReadinessFilterChange).toHaveBeenCalledWith(new Set());
    expect(props.onEditStateFilterChange).toHaveBeenCalledWith(new Set());
    expect(props.onIssueTypeFilterChange).toHaveBeenCalledWith(new Set());
  });

  it("renders search input when onSearchChange provided", () => {
    render(<FilterBar {...defaultProps} searchQuery="" onSearchChange={vi.fn()} />);
    expect(screen.getByTestId("search-input")).toBeInTheDocument();
  });

  it("renders save view button when onSaveView provided", () => {
    render(<FilterBar {...defaultProps} onSaveView={vi.fn()} />);
    expect(screen.getByTitle("Save current filter view")).toBeInTheDocument();
  });

  it("calls filter onChange when a filter dropdown selection changes", () => {
    render(<FilterBar {...defaultProps} />);
    fireEvent.click(screen.getByTestId("filter-status"));
    expect(defaultProps.onStatusFilterChange).toHaveBeenCalledWith(new Set(["test"]));
  });

  describe("sprint-state quick filters (BRDG-259)", () => {
    const sprintProps = {
      sprintFilter: new Set<string>(),
      onSprintFilterChange: vi.fn(),
      sprintOptions: ["5995", "6001"],
      sprintNameMap: { "5995": "BT: 138", "6001": "BT: 139" },
    };

    it("does not render the Sprint filter (or its state options) outside the All view", () => {
      render(<FilterBar {...defaultProps} />);
      expect(screen.queryByTestId("filter-sprint")).not.toBeInTheDocument();
      expect(screen.queryByTestId("leading-label-sprint")).not.toBeInTheDocument();
    });

    it("renders the state buckets as leading options inside the Sprint filter", () => {
      render(<FilterBar {...defaultProps} {...sprintProps} />);
      expect(screen.getByTestId("leading-label-sprint")).toHaveTextContent("By state");
      expect(screen.getByTestId("leading-__sprint-state__:active")).toHaveTextContent("Active sprints");
      expect(screen.getByTestId("leading-__sprint-state__:future")).toHaveTextContent("Future sprints");
      expect(screen.getByTestId("leading-__sprint-state__:closed")).toHaveTextContent("Closed sprints");
    });

    it("selects the closed-state bucket via the Sprint filter onChange", () => {
      const onSprintFilterChange = vi.fn();
      render(<FilterBar {...defaultProps} {...sprintProps} onSprintFilterChange={onSprintFilterChange} />);
      fireEvent.click(screen.getByTestId("leading-__sprint-state__:closed"));
      expect(onSprintFilterChange).toHaveBeenCalledWith(new Set(["__sprint-state__:closed"]));
    });
  });
});
