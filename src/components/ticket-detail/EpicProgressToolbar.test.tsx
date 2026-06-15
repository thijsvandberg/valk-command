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
    expect(screen.getByText("5 items")).toBeInTheDocument();
    unmount();

    renderToolbar({ items: [child("A", "TO DO")], filteredCount: 3, totalCount: 5, isFiltered: true });
    expect(screen.getByText("3 of 5 items")).toBeInTheDocument();
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

  it("gives each colored segment an explicit height and a flex wrapper so it fills the track", () => {
    renderToolbar({ items: [child("A", "DONE"), child("B", "TO DO")] });
    const bar = screen.getByRole("progressbar");
    // Each segment wrapper must use flex layout: the Tooltip trigger is an inline-flex
    // box that otherwise sits on the text baseline and gets clipped below the
    // overflow-hidden track (the bar then looks empty).
    [...bar.children].forEach((segment) => expect(segment).toHaveClass("flex"));
    const colored = bar.querySelectorAll("span > span");
    expect(colored.length).toBeGreaterThan(0);
    colored.forEach((span) => expect(span).toHaveStyle({ height: "8px" }));
  });

  it("hides the bar and metric toggle when `hidden`, keeping the count", () => {
    renderToolbar({ items: [child("A", "DONE"), child("B", "TO DO")], totalCount: 2, hidden: true });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "SP" })).toBeNull();
    expect(screen.getByText("2 items")).toBeInTheDocument();
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

  describe("interactive count badge", () => {
    it("stays a plain label (not a button) when filtered but no toggle handler is given", () => {
      renderToolbar({ items: [child("A", "TO DO")], filteredCount: 3, totalCount: 5, isFiltered: true });
      expect(screen.getByText("3 of 5 items")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /click to show all/i })).toBeNull();
    });

    it("shows all when a filtered badge is clicked", () => {
      const onToggleFilter = vi.fn();
      render(
        <EpicProgressToolbar
          items={[child("A", "TO DO")]}
          filteredCount={3}
          totalCount={5}
          isFiltered
          statusHiddenCount={1}
          deprecatedHiddenCount={1}
          deprecatedCount={1}
          onToggleFilter={onToggleFilter}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /click to show all/i }));
      expect(onToggleFilter).toHaveBeenCalledTimes(1);
    });

    it("offers a hide-deprecated toggle while showing all, when deprecated children exist", () => {
      const onToggleFilter = vi.fn();
      render(
        <EpicProgressToolbar
          items={[child("A", "TO DO")]}
          filteredCount={26}
          totalCount={26}
          isFiltered={false}
          deprecatedCount={3}
          onToggleFilter={onToggleFilter}
        />,
      );
      const btn = screen.getByRole("button", { name: /click to hide deprecated/i });
      expect(btn).toHaveTextContent("26 items");
      fireEvent.click(btn);
      expect(onToggleFilter).toHaveBeenCalledTimes(1);
    });

    it("is not interactive when nothing is filtered and there are no deprecated children", () => {
      render(
        <EpicProgressToolbar
          items={[child("A", "TO DO")]}
          filteredCount={5}
          totalCount={5}
          isFiltered={false}
          deprecatedCount={0}
          onToggleFilter={vi.fn()}
        />,
      );
      expect(screen.getByText("5 items")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /shown/i })).toBeNull();
    });

    it("breaks down the hidden children (status filter vs deprecated) in the tooltip", () => {
      vi.useFakeTimers();
      try {
        render(
          <EpicProgressToolbar
            items={[child("A", "TO DO")]}
            filteredCount={3}
            totalCount={26}
            isFiltered
            statusHiddenCount={20}
            deprecatedHiddenCount={3}
            deprecatedCount={3}
            onToggleFilter={vi.fn()}
          />,
        );
        fireEvent.mouseEnter(screen.getByRole("button", { name: /click to show all/i }));
        act(() => vi.advanceTimersByTime(250));
        expect(screen.getByText("3 shown")).toBeInTheDocument();
        expect(screen.getByText("of 26 total")).toBeInTheDocument();
        expect(screen.getByText("hidden by status filter")).toBeInTheDocument();
        expect(screen.getByText("deprecated, hidden")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
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
