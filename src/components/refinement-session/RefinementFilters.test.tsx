import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RefinementFilters } from "./RefinementFilters";

vi.mock("@/hooks/useOutsideClick", () => ({
  useOutsideClick: vi.fn(),
}));

vi.mock("@/components/sprint-board/SprintListModal", () => ({
  SprintListModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sprint-list-modal">
      <button onClick={onClose}>Close sprint modal</button>
    </div>
  ),
}));

vi.mock("@/components/shared/FilterDropdown", () => ({
  FilterDropdown: ({
    label,
    options,
    onChange,
  }: {
    label: string;
    options: string[];
    selected: Set<string>;
    onChange: (v: Set<string>) => void;
    searchable?: boolean;
    searchPlaceholder?: string;
    renderOption?: (v: string) => React.ReactNode;
  }) => (
    <div data-testid={`filter-dropdown-${label.toLowerCase()}`}>
      <span>{label}</span>
      {options.map((opt) => (
        <button key={opt} onClick={() => onChange(new Set([opt]))}>
          {opt}
        </button>
      ))}
    </div>
  ),
}));

type AnyFilters = any;

function makeFilters(overrides: Record<string, any> = {}): AnyFilters {
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

describe("RefinementFilters", () => {
  it("renders the Sprint filter button with label", () => {
    render(
      <RefinementFilters
        filters={makeFilters()}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    expect(screen.getByText("Sprint:")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("renders the Updated filter button with current label", () => {
    render(
      <RefinementFilters
        filters={makeFilters({ lastUpdatedLabel: "4 weeks" })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    expect(screen.getByText("Updated:")).toBeInTheDocument();
    expect(screen.getByText("4 weeks")).toBeInTheDocument();
  });

  it("renders the Hide estimated toggle button", () => {
    render(
      <RefinementFilters
        filters={makeFilters()}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    expect(screen.getByText("Hide estimated")).toBeInTheDocument();
  });

  it("calls setHideEstimated when toggle is clicked", () => {
    const setHideEstimated = vi.fn();
    render(
      <RefinementFilters
        filters={makeFilters({ hideEstimated: false, setHideEstimated })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    fireEvent.click(screen.getByText("Hide estimated"));
    expect(setHideEstimated).toHaveBeenCalledWith(true);
  });

  it("calls setHideEstimated with false when toggled off", () => {
    const setHideEstimated = vi.fn();
    render(
      <RefinementFilters
        filters={makeFilters({ hideEstimated: true, setHideEstimated })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    fireEvent.click(screen.getByText("Hide estimated"));
    expect(setHideEstimated).toHaveBeenCalledWith(false);
  });

  it("calls setSprintFilterOpen when Sprint button is clicked", () => {
    const setSprintFilterOpen = vi.fn();
    render(
      <RefinementFilters
        filters={makeFilters({ sprintFilterOpen: false, setSprintFilterOpen })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    // The sprint button contains "Sprint:" text
    const sprintButton = screen.getByText("Sprint:").closest("button")!;
    fireEvent.click(sprintButton);
    expect(setSprintFilterOpen).toHaveBeenCalledWith(true);
  });

  it("renders SprintListModal when sprintFilterOpen is true", () => {
    render(
      <RefinementFilters
        filters={makeFilters({ sprintFilterOpen: true })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    expect(screen.getByTestId("sprint-list-modal")).toBeInTheDocument();
  });

  it("does not render SprintListModal when sprintFilterOpen is false", () => {
    render(
      <RefinementFilters
        filters={makeFilters({ sprintFilterOpen: false })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    expect(screen.queryByTestId("sprint-list-modal")).not.toBeInTheDocument();
  });

  it("calls setLastUpdatedOpen when Updated button is clicked", () => {
    const setLastUpdatedOpen = vi.fn();
    render(
      <RefinementFilters
        filters={makeFilters({ lastUpdatedOpen: false, setLastUpdatedOpen })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    const updatedButton = screen.getByText("Updated:").closest("button")!;
    fireEvent.click(updatedButton);
    expect(setLastUpdatedOpen).toHaveBeenCalledWith(true);
  });

  it("renders last-updated dropdown options when open", () => {
    render(
      <RefinementFilters
        filters={makeFilters({ lastUpdatedOpen: true })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    // LAST_UPDATED_OPTIONS labels
    expect(screen.getByText("1 week")).toBeInTheDocument();
    expect(screen.getByText("2 weeks")).toBeInTheDocument();
    expect(screen.getAllByText("4 weeks").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("calls setLastUpdatedFilter and closes when an option is selected", () => {
    const setLastUpdatedFilter = vi.fn();
    const setLastUpdatedOpen = vi.fn();
    render(
      <RefinementFilters
        filters={makeFilters({ lastUpdatedOpen: true, setLastUpdatedFilter, setLastUpdatedOpen })}
        pinnedSprintIds={new Set()}
        epicOptions={[]}
      />,
    );
    fireEvent.click(screen.getByText("1 week"));
    expect(setLastUpdatedFilter).toHaveBeenCalledWith("1w");
    expect(setLastUpdatedOpen).toHaveBeenCalledWith(false);
  });

  it("renders the Epic FilterDropdown", () => {
    render(
      <RefinementFilters
        filters={makeFilters()}
        pinnedSprintIds={new Set()}
        epicOptions={["EPIC-A", "EPIC-B"]}
      />,
    );
    expect(screen.getByTestId("filter-dropdown-epic")).toBeInTheDocument();
  });
});
