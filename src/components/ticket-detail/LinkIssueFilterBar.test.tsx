import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinkIssueFilterBar } from "./LinkIssueFilterBar";
import type { LinkFilterState, LinkSearchFacets } from "@/hooks/useLinkIssueSearch";

vi.mock("lucide-react", async (importOriginal) => await importOriginal());

// Lightweight FilterDropdown stand-in: exposes the label and fires onChange with
// the first option so we can assert the wiring without the real popover.
vi.mock("@/components/shared/FilterDropdown", () => ({
  FilterDropdown: ({ label, options, onChange }: { label: string; options: string[]; onChange: (s: Set<string>) => void }) => (
    <button data-testid={`dropdown-${label.toLowerCase()}`} onClick={() => onChange(new Set([options[0]]))}>
      {label}
    </button>
  ),
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: () => <span data-testid="issue-type-icon" />,
  ISSUE_TYPE_COLORS: {},
}));

vi.mock("@/components/shared/Avatar", () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock("@/components/shared/AssigneePicker", () => ({ userInitials: () => "XX", userColor: () => "#000" }));

const mockSprints = { sprints: [
  { id: 10, name: "BT: 138", state: "active" },
  { id: 11, name: "GXP: 42", state: "future" },
  { id: 12, name: "BT: 137", state: "closed" },
] };
const mockEpics = [{ key: "VPL-1", name: "Checkout epic" }];

vi.mock("swr", () => ({
  default: (key: string) => {
    if (key === "/api/jira/sprints") return { data: mockSprints };
    if (key === "/api/epics") return { data: mockEpics };
    return { data: undefined };
  },
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
  epics: { listUrl: () => "/api/epics" },
}));

const EMPTY: LinkFilterState = {
  types: [], statuses: [], sprints: [], teams: [], epics: [], assignees: [], projects: [], updatedWithin: null, preset: null,
};

function renderBar(overrides: Partial<{
  filters: LinkFilterState;
  facets: LinkSearchFacets;
  filtersActive: boolean;
  setFilter: ReturnType<typeof vi.fn>;
  applyPreset: ReturnType<typeof vi.fn>;
  clearFilters: ReturnType<typeof vi.fn>;
}> = {}) {
  const props = {
    filters: overrides.filters ?? EMPTY,
    facets: overrides.facets ?? { types: ["story", "bug"], statuses: ["TO DO", "DONE"], projects: ["VPL"], assignees: ["Ada"] },
    filtersActive: overrides.filtersActive ?? false,
    setFilter: overrides.setFilter ?? vi.fn(),
    applyPreset: overrides.applyPreset ?? vi.fn(),
    clearFilters: overrides.clearFilters ?? vi.fn(),
  };
  render(<LinkIssueFilterBar {...(props as ComponentProps<typeof LinkIssueFilterBar>)} />);
  return props;
}

describe("LinkIssueFilterBar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders type, sprint, epic and assignee dropdowns plus presets", () => {
    renderBar();
    expect(screen.getByTestId("dropdown-type")).toBeInTheDocument();
    expect(screen.getByTestId("dropdown-sprint")).toBeInTheDocument();
    expect(screen.getByTestId("dropdown-epic")).toBeInTheDocument();
    expect(screen.getByTestId("dropdown-assignee")).toBeInTheDocument();
    expect(screen.getByText("Same epic")).toBeInTheDocument();
    expect(screen.getByText("Same sprint")).toBeInTheDocument();
  });

  it("renders the status dropdown from facets and forwards selection", () => {
    const setFilter = vi.fn();
    renderBar({ setFilter });
    const status = screen.getByTestId("dropdown-status");
    expect(status).toBeInTheDocument();
    fireEvent.click(status);
    expect(setFilter).toHaveBeenCalledWith("statuses", ["TO DO"]);
  });

  it("hides the status dropdown when there are no status facets", () => {
    renderBar({ facets: { types: ["story"], statuses: [], projects: ["VPL"], assignees: [] } });
    expect(screen.queryByTestId("dropdown-status")).not.toBeInTheDocument();
  });

  it("derives team options from sprint-name prefixes and forwards selection", () => {
    const setFilter = vi.fn();
    renderBar({ setFilter });
    const team = screen.getByTestId("dropdown-team");
    expect(team).toBeInTheDocument();
    // teams sorted: BT, GXP -> first option BT
    fireEvent.click(team);
    expect(setFilter).toHaveBeenCalledWith("teams", ["BT"]);
  });

  it("narrows the sprint dropdown to the selected team's sprints", () => {
    const setFilter = vi.fn();
    // With team BT selected, only BT sprints (ids 10, 12) are offered; clicking
    // the sprint dropdown fires onChange with the first remaining option.
    renderBar({ setFilter, filters: { ...EMPTY, teams: ["BT"] }, filtersActive: true });
    fireEvent.click(screen.getByTestId("dropdown-sprint"));
    // ordered active-first: BT 138 (active, id 10) before BT 137 (closed, id 12)
    expect(setFilter).toHaveBeenCalledWith("sprints", ["10"]);
  });

  it("hides the project dropdown when only one project exists", () => {
    renderBar({ facets: { types: ["story"], statuses: [], projects: ["VPL"], assignees: [] } });
    expect(screen.queryByTestId("dropdown-project")).not.toBeInTheDocument();
  });

  it("shows the project dropdown when more than one project exists", () => {
    renderBar({ facets: { types: ["story"], statuses: [], projects: ["VPL", "ABC"], assignees: [] } });
    expect(screen.getByTestId("dropdown-project")).toBeInTheDocument();
  });

  it("forwards a type selection through setFilter as an array", () => {
    const setFilter = vi.fn();
    renderBar({ setFilter });
    fireEvent.click(screen.getByTestId("dropdown-type"));
    expect(setFilter).toHaveBeenCalledWith("types", ["bug"]); // options sorted -> bug first
  });

  it("toggles the last-updated bucket on and off", () => {
    const setFilter = vi.fn();
    renderBar({ setFilter });
    fireEvent.click(screen.getByText("7d"));
    expect(setFilter).toHaveBeenCalledWith("updatedWithin", "7d");
  });

  it("clears an active bucket when clicked again", () => {
    const setFilter = vi.fn();
    renderBar({ setFilter, filters: { ...EMPTY, updatedWithin: "7d" }, filtersActive: true });
    fireEvent.click(screen.getByText("7d"));
    expect(setFilter).toHaveBeenCalledWith("updatedWithin", null);
  });

  it("applies the same-epic preset", () => {
    const applyPreset = vi.fn();
    renderBar({ applyPreset });
    fireEvent.click(screen.getByText("Same epic"));
    expect(applyPreset).toHaveBeenCalledWith("epic");
  });

  it("shows Clear only when filters are active and calls clearFilters", () => {
    const clearFilters = vi.fn();
    const { rerender } = render(
      <LinkIssueFilterBar
        filters={EMPTY}
        facets={{ types: [], statuses: [], projects: [], assignees: [] }}
        filtersActive={false}
        setFilter={vi.fn()}
        applyPreset={vi.fn()}
        clearFilters={clearFilters}
      />,
    );
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
    rerender(
      <LinkIssueFilterBar
        filters={{ ...EMPTY, types: ["bug"] }}
        facets={{ types: ["bug"], statuses: [], projects: [], assignees: [] }}
        filtersActive
        setFilter={vi.fn()}
        applyPreset={vi.fn()}
        clearFilters={clearFilters}
      />,
    );
    fireEvent.click(screen.getByText("Clear"));
    expect(clearFilters).toHaveBeenCalled();
  });
});
