import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusinessValuePicker } from "./BusinessValuePicker";

vi.mock("lucide-react", () => ({
  Minus: (props: Record<string, unknown>) => <span data-testid="minus-icon" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="x-icon" {...props} />,
  TrendingUp: (props: Record<string, unknown>) => <span data-testid="trending-up-icon" {...props} />,
}));

vi.mock("@/components/shared/BasePicker", () => {
  let openState = false;
  let triggerRefValue: HTMLElement | null = null;

  const usePickerState = () => ({
    open: openState,
    pos: openState ? { top: 0, left: 0 } : null,
    triggerRef: { get current() { return triggerRefValue; }, set current(v: HTMLElement | null) { triggerRefValue = v; } } as React.RefObject<HTMLElement | null>,
    popoverRef: { current: null } as React.RefObject<HTMLDivElement | null>,
    handleOpen: () => { openState = true; },
    handleClose: () => { openState = false; },
    getPopoverStyle: () => ({ top: 0, left: 0, backgroundColor: "var(--color-surface-floating)" }),
  });

  return { usePickerState };
});

vi.mock("@/types/ticket", () => ({
  // Flat violet tone regardless of value (BRDG-321 — no ramp).
  getBvColor: (v: number) =>
    v <= 0
      ? { text: "#7c8595", bg: "color-mix(in srgb, #64748b 12%, transparent)", solid: "#64748b" }
      : { text: "var(--meta-bv-fg)", bg: "color-mix(in srgb, #8b5cf6 18%, transparent)", solid: "#8b5cf6" },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BusinessValuePicker", () => {
  it("renders button with title when value is set", () => {
    render(<BusinessValuePicker value={3} onChange={vi.fn()} />);
    expect(screen.getByTitle("Business Value: 3")).toBeInTheDocument();
  });

  it("renders N/A title when value is 0", () => {
    render(<BusinessValuePicker value={0} onChange={vi.fn()} />);
    expect(screen.getByTitle("N/A")).toBeInTheDocument();
  });

  it("renders set title when value is null", () => {
    render(<BusinessValuePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByTitle("Set Business Value")).toBeInTheDocument();
  });

  it("renders lg variant with BV label", () => {
    render(<BusinessValuePicker value={5} onChange={vi.fn()} size="lg" />);
    expect(screen.getByText("BV")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("displays dash for value 0 in lg variant", () => {
    render(<BusinessValuePicker value={0} onChange={vi.fn()} size="lg" />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("labels the open popover with a Business value heading", () => {
    const { rerender } = render(<BusinessValuePicker value={null} onChange={vi.fn()} />);
    // Open the portalled popover (mocked usePickerState toggles a module flag).
    fireEvent.click(screen.getByTitle("Set Business Value"));
    rerender(<BusinessValuePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Business value")).toBeInTheDocument();
    // Close again so the shared open flag does not leak into later tests.
    fireEvent.click(screen.getByTitle("Set Business Value"));
  });

  describe("showMetricIcon", () => {
    it("renders the trending-up icon in compact mode when set and value present", () => {
      render(<BusinessValuePicker value={3} onChange={vi.fn()} showMetricIcon />);
      expect(screen.getByTestId("trending-up-icon")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders a faded trending-up icon when value is unset", () => {
      render(<BusinessValuePicker value={null} onChange={vi.fn()} showMetricIcon />);
      expect(screen.getByTestId("trending-up-icon")).toBeInTheDocument();
    });

    it("renders no icon by default in compact mode", () => {
      render(<BusinessValuePicker value={3} onChange={vi.fn()} />);
      expect(screen.queryByTestId("trending-up-icon")).not.toBeInTheDocument();
    });

    it("replaces the BV text label with the trending-up icon in lg mode when set", () => {
      render(<BusinessValuePicker value={5} onChange={vi.fn()} size="lg" showMetricIcon />);
      expect(screen.queryByText("BV")).not.toBeInTheDocument();
      expect(screen.getByTestId("trending-up-icon")).toBeInTheDocument();
    });
  });

  describe("richTooltip", () => {
    it("omits the native title attribute when set", () => {
      render(<BusinessValuePicker value={5} onChange={vi.fn()} richTooltip />);
      expect(screen.getByRole("button").getAttribute("title")).toBeNull();
    });

    it("keeps the native title attribute by default", () => {
      render(<BusinessValuePicker value={5} onChange={vi.fn()} />);
      expect(screen.getByRole("button").getAttribute("title")).toBe("Business Value: 5");
    });
  });

  describe("revealWhenEmpty", () => {
    it("hides an empty trigger until the row is hovered", () => {
      const { container } = render(
        <BusinessValuePicker value={null} onChange={vi.fn()} revealWhenEmpty />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("opacity-0");
      expect(wrapper.className).toContain("group-hover:opacity-100");
    });

    it("keeps a filled trigger always visible", () => {
      const { container } = render(
        <BusinessValuePicker value={3} onChange={vi.fn()} revealWhenEmpty />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).not.toContain("opacity-0");
    });

    it("follows the row-scoped group when revealGroup is row", () => {
      const { container } = render(
        <BusinessValuePicker value={null} onChange={vi.fn()} revealWhenEmpty revealGroup="row" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("group-hover/row:opacity-100");
    });

    it("does not hide an empty trigger when revealWhenEmpty is off", () => {
      const { container } = render(<BusinessValuePicker value={null} onChange={vi.fn()} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).not.toContain("opacity-0");
    });
  });
});
