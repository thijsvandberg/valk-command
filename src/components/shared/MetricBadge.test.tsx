import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
    expect(screen.getByLabelText("N/A")).toBeInTheDocument();
  });

  it("renders an en-dash and 'Set' label when value is null", () => {
    render(<MetricBadge metric="bv" value={null} />);
    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.getByLabelText("Set Business Value")).toBeInTheDocument();
  });

  it("always exposes a descriptive accessible label", () => {
    render(<MetricBadge metric="sp" value={8} />);
    expect(screen.getByLabelText("Story Points: 8")).toBeInTheDocument();
  });

  it("uses the styled tooltip by default (no native title attribute)", () => {
    const { container } = render(<MetricBadge metric="sp" value={8} />);
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("falls back to the native title when tooltip is disabled", () => {
    render(<MetricBadge metric="sp" value={8} tooltip={false} />);
    expect(screen.getByTitle("Story Points: 8")).toBeInTheDocument();
  });

  it("keeps the plain title as the accessible label even with custom tooltipContent", () => {
    render(<MetricBadge metric="bv" value={6} tooltipContent="Business value: 6 · avg 2.0 per scored ticket" />);
    expect(screen.getByLabelText("Business Value: 6")).toBeInTheDocument();
  });

  it("shows custom tooltipContent on hover when provided", () => {
    vi.useFakeTimers();
    try {
      render(<MetricBadge metric="bv" value={6} tooltipContent="Business value: 6 · avg 2.0 per scored ticket" />);
      fireEvent.mouseEnter(screen.getByLabelText("Business Value: 6").parentElement!);
      act(() => { vi.advanceTimersByTime(400); });
      expect(screen.getByText("Business value: 6 · avg 2.0 per scored ticket")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses neutral SP color untinted and a value color when tinted", () => {
    const { rerender } = render(<MetricBadge metric="sp" value={8} />);
    const plain = screen.getByText("8").closest("span")!;
    expect(plain.getAttribute("style")).toContain("var(--color-text-secondary)");

    rerender(<MetricBadge metric="sp" value={8} tinted />);
    const tinted = screen.getByText("8").closest("span")!;
    expect(tinted.getAttribute("style")).not.toContain("var(--color-text-secondary)");
  });

  it("renders the Hash glyph for SP and TrendingUp for BV (BRDG-321 marker family)", () => {
    const sp = render(<MetricBadge metric="sp" value={3} />);
    expect(sp.container.querySelector(".lucide-hash")).toBeInTheDocument();
    const bv = render(<MetricBadge metric="bv" value={5} />);
    expect(bv.container.querySelector(".lucide-trending-up")).toBeInTheDocument();
  });

  it("renders a dashed, unfilled outline with no fade when penciled (BRDG-454)", () => {
    render(<MetricBadge metric="sp" value={8} penciled />);
    const badge = screen.getByText("8").closest("span")!;
    expect(badge.className).toContain("border-dashed");
    // Penciled keeps a transparent fill and, unlike `dimmed`, is not faded.
    expect(badge.getAttribute("style")).toContain("background-color: transparent");
    expect(badge.className).not.toContain("opacity-55");
    // Border tone is derived from the slate SP text color, so it stays theme-aware.
    expect(badge.getAttribute("style")).toContain("border-color");
  });

  it("uses the theme-aware violet tone for BV with no value ramp (3 and 8 match)", () => {
    const a = render(<MetricBadge metric="bv" value={3} tinted />);
    const three = screen.getByText("3").closest("span")!;
    expect(three.getAttribute("style")).toContain("var(--meta-bv-fg)");
    a.unmount();
    render(<MetricBadge metric="bv" value={8} tinted />);
    const eight = screen.getByText("8").closest("span")!;
    expect(eight.getAttribute("style")).toContain("var(--meta-bv-fg)");
  });
});
