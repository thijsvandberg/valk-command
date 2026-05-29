import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReadinessCell, ReadinessIcon } from "./ReadinessCell";

vi.mock("lucide-react", () => ({
  FilePen: (props: Record<string, unknown>) => <svg data-testid="icon-drafting" {...props} />,
  MessageCircleQuestion: (props: Record<string, unknown>) => <svg data-testid="icon-waiting" {...props} />,
  CheckCircle2: (props: Record<string, unknown>) => <svg data-testid="icon-ready" {...props} />,
  Ban: (props: Record<string, unknown>) => <svg data-testid="icon-hold" {...props} />,
  Minus: (props: Record<string, unknown>) => <svg data-testid="icon-minus" {...props} />,
}));

vi.mock("@/hooks/useOutsideClick", () => ({
  useOutsideClick: vi.fn(),
}));

describe("ReadinessIcon", () => {
  it("renders drafting icon", () => {
    render(<ReadinessIcon value="drafting" />);
    expect(screen.getByTestId("icon-drafting")).toBeInTheDocument();
  });

  it("renders waiting_for_feedback icon", () => {
    render(<ReadinessIcon value="waiting_for_feedback" />);
    expect(screen.getByTestId("icon-waiting")).toBeInTheDocument();
  });

  it("renders ready_to_refine icon", () => {
    render(<ReadinessIcon value="ready_to_refine" />);
    expect(screen.getByTestId("icon-ready")).toBeInTheDocument();
  });

  it("renders on_hold icon", () => {
    render(<ReadinessIcon value="on_hold" />);
    expect(screen.getByTestId("icon-hold")).toBeInTheDocument();
  });
});

describe("ReadinessCell", () => {
  it("renders button with title for current value", () => {
    render(<ReadinessCell value="drafting" onChange={vi.fn()} />);
    expect(screen.getByTitle("Drafting")).toBeInTheDocument();
  });

  it("renders fallback title when value is null", () => {
    render(<ReadinessCell value={null} onChange={vi.fn()} />);
    expect(screen.getByTitle("Ready for Development")).toBeInTheDocument();
  });

  it("opens dropdown on click", () => {
    render(<ReadinessCell value="drafting" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Drafting"));
    expect(screen.getByText("Drafting")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Feedback")).toBeInTheDocument();
    expect(screen.getByText("Ready to Refine")).toBeInTheDocument();
    expect(screen.getByText("On Hold")).toBeInTheDocument();
    expect(screen.getByText("Ready for Development")).toBeInTheDocument();
  });

  it("calls onChange with selected value and closes dropdown", () => {
    const onChange = vi.fn();
    render(<ReadinessCell value="drafting" onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Drafting"));
    fireEvent.click(screen.getByText("On Hold"));
    expect(onChange).toHaveBeenCalledWith("on_hold");
    expect(screen.queryByText("Ready to Refine")).not.toBeInTheDocument();
  });

  it("calls onChange with null for Ready for Development", () => {
    const onChange = vi.fn();
    render(<ReadinessCell value="drafting" onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Drafting"));
    fireEvent.click(screen.getByText("Ready for Development"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("toggles dropdown closed on second click", () => {
    render(<ReadinessCell value="drafting" onChange={vi.fn()} />);
    const btn = screen.getByTitle("Drafting");
    fireEvent.click(btn);
    expect(screen.getByText("On Hold")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText("On Hold")).not.toBeInTheDocument();
  });
});
