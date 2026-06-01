import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MetricBadge } from "./MetricBadge";

describe("MetricBadge", () => {
  it("renders the value with a leading icon for SP", () => {
    const { container } = render(<MetricBadge metric="sp" value={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the value with a leading icon for BV", () => {
    const { container } = render(<MetricBadge metric="bv" value={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a dash for the N/A value (0)", () => {
    render(<MetricBadge metric="sp" value={0} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByTitle("N/A")).toBeInTheDocument();
  });

  it("renders an en-dash and 'Set' title when value is null", () => {
    render(<MetricBadge metric="bv" value={null} />);
    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.getByTitle("Set Business Value")).toBeInTheDocument();
  });

  it("exposes a descriptive native title by default", () => {
    render(<MetricBadge metric="sp" value={8} />);
    expect(screen.getByTitle("Story Points: 8")).toBeInTheDocument();
  });

  it("omits the native title when tooltip is enabled", () => {
    const { container } = render(<MetricBadge metric="sp" value={8} tooltip />);
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("uses neutral SP color untinted and a value color when tinted", () => {
    const { rerender } = render(<MetricBadge metric="sp" value={8} />);
    const plain = screen.getByText("8").closest("span")!;
    expect(plain.getAttribute("style")).toContain("var(--color-text-secondary)");

    rerender(<MetricBadge metric="sp" value={8} tinted />);
    const tinted = screen.getByText("8").closest("span")!;
    expect(tinted.getAttribute("style")).not.toContain("var(--color-text-secondary)");
  });
});
