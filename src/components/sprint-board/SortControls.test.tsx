import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SortDropdown } from "./SortControls";

vi.mock("lucide-react", () => ({
  ArrowUpDown: (props: Record<string, unknown>) => <span data-testid="sort-icon" {...props} />,
  ArrowUp: (props: Record<string, unknown>) => <span data-testid="arrow-up" {...props} />,
  ArrowDown: (props: Record<string, unknown>) => <span data-testid="arrow-down" {...props} />,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ onClick, title, children, ...rest }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} title={title as string} aria-label={rest["aria-label"] as string}>
      {(rest as Record<string, unknown>).icon as React.ReactNode}
      {children as React.ReactNode}
    </button>
  ),
}));

vi.mock("@/hooks/useOutsideClick", () => ({
  useOutsideClick: vi.fn(),
}));

describe("SortDropdown", () => {
  it("renders sort button", () => {
    render(<SortDropdown field="rank" direction="asc" onChange={vi.fn()} />);
    expect(screen.getByTitle("Sort")).toBeInTheDocument();
  });

  it("opens dropdown on click", () => {
    render(<SortDropdown field="rank" direction="asc" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Sort"));
    expect(screen.getByText("Jira rank (default)")).toBeInTheDocument();
    expect(screen.getByText("Last changed")).toBeInTheDocument();
    expect(screen.getByText("Quality Score")).toBeInTheDocument();
  });

  it("selects a different field with its default direction", () => {
    const onChange = vi.fn();
    render(<SortDropdown field="rank" direction="asc" onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Sort"));
    fireEvent.click(screen.getByText("Last changed"));
    expect(onChange).toHaveBeenCalledWith("lastChanged", "desc");
  });

  it("toggles direction when clicking same field", () => {
    const onChange = vi.fn();
    render(<SortDropdown field="quality" direction="desc" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByText("Quality Score"));
    expect(onChange).toHaveBeenCalledWith("quality", "asc");
  });

  it("shows 'Reset to default' when not on rank sort", () => {
    render(<SortDropdown field="quality" direction="desc" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    expect(screen.getByText("Reset to default")).toBeInTheDocument();
  });

  it("resets to rank/asc when Reset clicked", () => {
    const onChange = vi.fn();
    render(<SortDropdown field="quality" direction="desc" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    fireEvent.click(screen.getByText("Reset to default"));
    expect(onChange).toHaveBeenCalledWith("rank", "asc");
  });

  it("does not show Reset when already on default", () => {
    render(<SortDropdown field="rank" direction="asc" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Sort"));
    expect(screen.queryByText("Reset to default")).not.toBeInTheDocument();
  });
});
