import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EpicBadge, SubtaskCountBadge, InRefinementBadge, SprintBadge, MetricChip } from "./IssueMetaBadges";

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
    // Icon-only chip (the session name lives in the tooltip); the gem icon renders.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("SprintBadge renders the name and hides when null", () => {
    const { rerender, container } = render(<SprintBadge name="BT: 140" />);
    expect(screen.getByText("BT: 140")).toBeInTheDocument();
    rerender(<SprintBadge name={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("MetricChip renders the value for sp and bv", () => {
    const { rerender } = render(<MetricChip metric="sp" value={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    rerender(<MetricChip metric="bv" value={4} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
