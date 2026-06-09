import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EpicBadge, SubtaskCountBadge, InRefinementBadge, SprintBadge, MetricChip, SprintOrBacklogBadge, EpicChildCountBadge } from "./IssueMetaBadges";

describe("IssueMetaBadges", () => {
  it("EpicBadge renders the epic name", () => {
    render(<EpicBadge epic="Group Reservations" />);
    expect(screen.getByText("Group Reservations")).toBeInTheDocument();
  });

  it("SubtaskCountBadge shows open/total and hides when there are none", () => {
    const { rerender, container } = render(<SubtaskCountBadge open={2} total={6} />);
    expect(screen.getByText("2/6")).toBeInTheDocument();
    rerender(<SubtaskCountBadge open={0} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("InRefinementBadge renders only when there are session names", () => {
    const { rerender, container } = render(<InRefinementBadge sessionNames={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<InRefinementBadge sessionNames={["Refine A"]} />);
    // Icon-only chip (the session name lives in the tooltip); the Boxes glyph renders,
    // tinted with the theme-aware refinement var (BRDG-321 — no more Gem).
    expect(container.querySelector(".lucide-boxes")).toBeInTheDocument();
    expect(container.querySelector(".lucide-gem")).toBeNull();
    const chip = container.querySelector("span[style]")!;
    expect(chip.getAttribute("style")).toContain("var(--meta-refine-fg)");
  });

  it("SprintBadge renders the name and hides when null", () => {
    const { rerender, container } = render(<SprintBadge name="BT: 140" />);
    expect(screen.getByText("BT: 140")).toBeInTheDocument();
    rerender(<SprintBadge name={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("SprintOrBacklogBadge shows the sprint name when set, Backlog otherwise", () => {
    const { rerender } = render(<SprintOrBacklogBadge sprintName="BT: 140" />);
    expect(screen.getByText("BT: 140")).toBeInTheDocument();
    rerender(<SprintOrBacklogBadge sprintName={null} />);
    expect(screen.getByText("Backlog")).toBeInTheDocument();
  });

  it("EpicChildCountBadge shows the count and hides at zero", () => {
    const { rerender, container } = render(<EpicChildCountBadge count={7} />);
    expect(screen.getByText("7")).toBeInTheDocument();
    rerender(<EpicChildCountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("MetricChip renders the value with the right glyph for sp and bv (BRDG-321)", () => {
    const { rerender, container } = render(<MetricChip metric="sp" value={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(container.querySelector(".lucide-hash")).toBeInTheDocument();
    rerender(<MetricChip metric="bv" value={4} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(container.querySelector(".lucide-trending-up")).toBeInTheDocument();
  });
});
