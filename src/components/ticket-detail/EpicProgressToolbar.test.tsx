import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EpicProgressToolbar } from "./EpicProgressToolbar";
import type { EpicChild, JiraStatus } from "@/types/ticket";

function child(
  key: string,
  jiraStatus: JiraStatus,
  storyPoints: number | null = null,
  businessValue: number | null = null,
): EpicChild {
  return {
    key,
    title: key,
    type: "story",
    jiraStatus,
    assignee: null,
    storyPoints,
    businessValue,
    subtaskCount: 0,
    readiness: null,
    jiraRank: null,
    sprintName: null,
  } as EpicChild;
}

function renderToolbar(props: Partial<React.ComponentProps<typeof EpicProgressToolbar>> = {}) {
  const items = props.items ?? [];
  return render(
    <EpicProgressToolbar
      items={items}
      filteredCount={props.filteredCount ?? items.length}
      totalCount={props.totalCount ?? items.length}
      isFiltered={props.isFiltered ?? false}
      showStats={props.showStats ?? true}
      hidden={props.hidden ?? false}
      actions={props.actions}
    />,
  );
}

describe("EpicProgressToolbar", () => {
  // The metric persists via localStorage; reset so each test starts on "items".
  beforeEach(() => localStorage.clear());

  it("renders no progress bar when there are no active (non-deprecated) children", () => {
    renderToolbar({ items: [], totalCount: 0 });
    expect(screen.queryByRole("progressbar")).toBeNull();

    renderToolbar({ items: [child("A", "DEPRECATED")], totalCount: 1 });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the bare total when not filtered and 'X of Y' when filtered", () => {
    const { unmount } = renderToolbar({ items: [child("A", "TO DO")], totalCount: 5, isFiltered: false });
    expect(screen.getByText("5")).toBeInTheDocument();
    unmount();

    renderToolbar({ items: [child("A", "TO DO")], filteredCount: 3, totalCount: 5, isFiltered: true });
    expect(screen.getByText("3 of 5")).toBeInTheDocument();
  });

  it("never renders the loud status-pill labels", () => {
    renderToolbar({ items: [child("A", "TO DO"), child("B", "IN PROGRESS"), child("C", "DONE")] });
    expect(screen.queryByText("TO DO: 1")).toBeNull();
    expect(screen.queryByText(/IN PROGRESS:/)).toBeNull();
    expect(screen.queryByText(/DONE:/)).toBeNull();
  });

  it("reflects item completion on the bar and recomputes when the metric toggle is switched", () => {
    renderToolbar({
      items: [child("A", "DONE", 4, 8), child("B", "TO DO", 5, 2), child("C", "IN PROGRESS", 2, 0)],
    });
    // Default metric is items: 1 done of 3 -> 33%
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
    // Switch to SP: 4 done of 11 -> 36%
    fireEvent.click(screen.getByRole("button", { name: "SP" }));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("36");
    expect(localStorage.getItem("epic-stats-metric")).toBe('"sp"');
  });

  it("gives each colored segment an explicit (non-collapsing) height", () => {
    renderToolbar({ items: [child("A", "DONE"), child("B", "TO DO")] });
    const bar = screen.getByRole("progressbar");
    const colored = bar.querySelectorAll("span > span");
    expect(colored.length).toBeGreaterThan(0);
    colored.forEach((span) => expect(span).toHaveStyle({ height: "8px" }));
  });

  it("hides the bar and metric toggle when `hidden`, keeping the count", () => {
    renderToolbar({ items: [child("A", "DONE"), child("B", "TO DO")], totalCount: 2, hidden: true });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "SP" })).toBeNull();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders only the count + actions (no bar) when showStats is false", () => {
    renderToolbar({
      items: [child("A", "DONE"), child("B", "TO DO")],
      totalCount: 2,
      showStats: false,
      actions: <button type="button">List options</button>,
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button", { name: "List options" })).toBeInTheDocument();
  });

  describe("segment hover tooltip", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("reveals the status, count and share for the hovered segment", () => {
      render(
        <EpicProgressToolbar
          items={[child("A", "DONE"), child("B", "TO DO"), child("C", "TO DO")]}
          filteredCount={3}
          totalCount={3}
          isFiltered={false}
        />,
      );
      const bar = screen.getByRole("progressbar");
      // First segment in render order is DONE (1 of 3 -> 33%).
      const firstWrapper = bar.querySelector(":scope > div span");
      fireEvent.mouseEnter(firstWrapper!);
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.getByText(/done · 33%/)).toBeInTheDocument();
      expect(screen.getByText("1 items")).toBeInTheDocument();
    });
  });
});
