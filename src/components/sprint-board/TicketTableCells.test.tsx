import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditStateDot, QualityBadge, POStatusIcon, POStatusCell, getJiraUrl } from "./TicketTableCells";

vi.mock("lucide-react", () => ({
  Minus: (props: Record<string, unknown>) => <span data-testid="icon-minus" {...props} />,
  Sparkles: (props: Record<string, unknown>) => <span data-testid="icon-sparkles" {...props} />,
  Pencil: (props: Record<string, unknown>) => <span data-testid="icon-pencil" {...props} />,
  CircleDot: (props: Record<string, unknown>) => <span data-testid="icon-circledot" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  Pause: (props: Record<string, unknown>) => <span data-testid="icon-pause" {...props} />,
  Clock: (props: Record<string, unknown>) => <span data-testid="icon-clock" {...props} />,
}));

vi.mock("@/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/sprint-board/ReviewPopover", () => ({
  ReviewPopover: () => <div data-testid="review-popover" />,
}));

vi.mock("@/hooks/useOutsideClick", () => ({
  useOutsideClick: vi.fn(),
}));

vi.mock("@/components/sprint-board/FilterBar", () => ({
  PO_STATUS_COLORS: {
    New: { text: "#10b981", bg: "#10b98120" },
    Draft: { text: "#3b82f6", bg: "#3b82f620" },
    "Awaiting Feedback": { text: "#f59e0b", bg: "#f59e0b20" },
    "Ready for Refinement": { text: "#8b5cf6", bg: "#8b5cf620" },
    Ready: { text: "#22c55e", bg: "#22c55e20" },
    "On Hold": { text: "#6b7280", bg: "#6b728020" },
  },
}));

describe("getJiraUrl", () => {
  it("returns correct Jira URL", () => {
    expect(getJiraUrl("PROJ-123")).toContain("/browse/PROJ-123");
  });
});

describe("EditStateDot", () => {
  it("renders for local_edits state", () => {
    const { container } = render(<EditStateDot state="local_edits" />);
    expect(container.querySelector(".rounded-full")).toBeInTheDocument();
  });

  it("renders for conflict state", () => {
    const { container } = render(<EditStateDot state="conflict" />);
    expect(container.querySelector(".rounded-full")).toBeInTheDocument();
  });
});

describe("QualityBadge", () => {
  it("renders score text when score is provided", () => {
    render(<QualityBadge score={85} />);
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("renders dim dot when score is null", () => {
    const { container } = render(<QualityBadge score={null} />);
    const dot = container.querySelector(".rounded-full");
    expect(dot).toBeInTheDocument();
  });

  it("shows title with score value", () => {
    render(<QualityBadge score={92} />);
    expect(screen.getByTitle("Quality: 92/100")).toBeInTheDocument();
  });

  it("calls onTogglePopover when clickable", () => {
    const toggle = vi.fn();
    render(<QualityBadge score={75} ticketKey="PROJ-1" onTogglePopover={toggle} />);
    fireEvent.click(screen.getByTitle("Quality: 75/100"));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("shows ReviewPopover when isPopoverOpen", () => {
    render(<QualityBadge score={75} ticketKey="PROJ-1" isPopoverOpen onTogglePopover={vi.fn()} />);
    expect(screen.getByTestId("review-popover")).toBeInTheDocument();
  });
});

describe("POStatusIcon", () => {
  it("renders correct icon for each status", () => {
    const { rerender } = render(<POStatusIcon status="New" />);
    expect(screen.getByTestId("icon-sparkles")).toBeInTheDocument();

    rerender(<POStatusIcon status="Draft" />);
    expect(screen.getByTestId("icon-pencil")).toBeInTheDocument();

    rerender(<POStatusIcon status="Ready" />);
    expect(screen.getByTestId("icon-check")).toBeInTheDocument();

    rerender(<POStatusIcon status="On Hold" />);
    expect(screen.getByTestId("icon-pause")).toBeInTheDocument();

    rerender(<POStatusIcon status={null} />);
    expect(screen.getByTestId("icon-minus")).toBeInTheDocument();
  });
});

describe("POStatusCell", () => {
  it("renders button with status title", () => {
    render(<POStatusCell value="Draft" onChange={vi.fn()} />);
    expect(screen.getByTitle("Draft")).toBeInTheDocument();
  });

  it("renders 'No status' title when null", () => {
    render(<POStatusCell value={null} onChange={vi.fn()} />);
    expect(screen.getByTitle("No status")).toBeInTheDocument();
  });

  it("opens dropdown and shows all PO status options", () => {
    render(<POStatusCell value="Draft" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Draft"));
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Awaiting Feedback")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("On Hold")).toBeInTheDocument();
  });

  it("calls onChange with selected status", () => {
    const onChange = vi.fn();
    render(<POStatusCell value="Draft" onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Draft"));
    fireEvent.click(screen.getByText("Ready"));
    expect(onChange).toHaveBeenCalledWith("Ready");
  });

  it("shows label when showLabel is true", () => {
    render(<POStatusCell value="New" onChange={vi.fn()} showLabel />);
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});
