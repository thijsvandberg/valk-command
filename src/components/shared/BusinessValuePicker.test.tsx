import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BusinessValuePicker } from "./BusinessValuePicker";

vi.mock("lucide-react", () => ({
  Minus: (props: Record<string, unknown>) => <span data-testid="minus-icon" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="x-icon" {...props} />,
}));

vi.mock("@/components/shared/BasePicker", () => {
  let openState = false;
  let triggerRefValue: HTMLElement | null = null;

  const usePickerState = () => ({
    open: openState,
    pos: openState ? { top: 0, left: 0 } : null,
    triggerRef: { current: triggerRefValue, set current(v: HTMLElement | null) { triggerRefValue = v; } } as React.RefObject<HTMLElement | null>,
    popoverRef: { current: null } as React.RefObject<HTMLDivElement | null>,
    handleOpen: () => { openState = true; },
    handleClose: () => { openState = false; },
    getPopoverStyle: () => ({ top: 0, left: 0, backgroundColor: "var(--color-surface-floating)" }),
  });

  return { usePickerState };
});

vi.mock("@/types/ticket", () => ({
  getBvColor: (v: number) => {
    if (v <= 2) return { text: "#22c55e", bg: "#22c55e20" };
    if (v <= 5) return { text: "#eab308", bg: "#eab30820" };
    return { text: "#ef4444", bg: "#ef444420" };
  },
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
});
