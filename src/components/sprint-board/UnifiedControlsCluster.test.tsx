import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UnifiedControlsCluster } from "./UnifiedControlsCluster";
import type { FilterControlsPanelProps } from "./FilterControlsPanel";

// The two-pane panel is exercised in FilterControlsPanel.test; here it is a stub so
// the cluster's own behaviour (search, open/close, outside-click) is isolated.
vi.mock("./FilterControlsPanel", () => ({
  FilterControlsPanel: () => <div data-testid="filter-panel" />,
}));

function renderCluster(overrides: Partial<Parameters<typeof UnifiedControlsCluster>[0]> = {}) {
  const props = {
    searchQuery: "",
    onSearchChange: vi.fn(),
    sortField: "rank" as const,
    sortDir: "asc" as const,
    onSortChange: vi.fn(),
    activeFilterCount: 0,
    filterProps: {} as FilterControlsPanelProps,
    ...overrides,
  };
  render(<UnifiedControlsCluster {...props} />);
  return props;
}

describe("UnifiedControlsCluster (BRDG-344)", () => {
  it("expands the search segment to a field and collapses on clear", () => {
    renderCluster();
    fireEvent.click(screen.getByTitle("Search tickets"));
    const input = screen.getByPlaceholderText("Search tickets...");
    expect(input).toBeTruthy();
    // Blur with an empty value collapses back to the icon.
    fireEvent.blur(input);
    expect(screen.queryByPlaceholderText("Search tickets...")).toBeNull();
  });

  it("forwards typed search to onSearchChange", () => {
    const onSearchChange = vi.fn();
    renderCluster({ onSearchChange });
    fireEvent.click(screen.getByTitle("Search tickets"));
    fireEvent.change(screen.getByPlaceholderText("Search tickets..."), { target: { value: "auth" } });
    expect(onSearchChange).toHaveBeenCalledWith("auth");
  });

  it("opens and closes the filter panel from the Filters button", () => {
    renderCluster();
    expect(screen.queryByTestId("filter-panel")).toBeNull();
    fireEvent.click(screen.getByLabelText("Filters"));
    expect(screen.getByTestId("filter-panel")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Filters"));
    expect(screen.queryByTestId("filter-panel")).toBeNull();
  });

  it("closes the filter panel on outside click and on Escape", () => {
    renderCluster();
    fireEvent.click(screen.getByLabelText("Filters"));
    expect(screen.getByTestId("filter-panel")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("filter-panel")).toBeNull();

    fireEvent.click(screen.getByLabelText("Filters"));
    expect(screen.getByTestId("filter-panel")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("filter-panel")).toBeNull();
  });

  it("shows the active filter count on the Filters trigger", () => {
    renderCluster({ activeFilterCount: 4 });
    const trigger = screen.getByLabelText("Filters");
    expect(trigger.textContent).toContain("4");
  });
});
