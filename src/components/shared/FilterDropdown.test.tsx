import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterDropdown } from "./FilterDropdown";

vi.mock("lucide-react", () => ({
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="chevron" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="x-icon" {...props} />,
  Search: (props: Record<string, unknown>) => <span data-testid="search-icon" {...props} />,
}));

vi.mock("@/hooks/useOutsideClick", () => ({
  useOutsideClick: vi.fn(),
}));

const OPTIONS = ["alpha", "beta", "gamma"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FilterDropdown", () => {
  it("renders label text on trigger button", () => {
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set()} onChange={vi.fn()} />);
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("opens dropdown on click", () => {
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set()} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Status"));
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
  });

  it("selects an option and calls onChange with updated set", () => {
    const onChange = vi.fn();
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set()} onChange={onChange} />);
    fireEvent.click(screen.getByText("Status"));
    fireEvent.click(screen.getByText("alpha"));
    expect(onChange).toHaveBeenCalledWith(new Set(["alpha"]));
  });

  it("deselects an already-selected option", () => {
    const onChange = vi.fn();
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set(["alpha"])} onChange={onChange} />);
    fireEvent.click(screen.getByText("Status"));
    fireEvent.click(screen.getByText("alpha"));
    expect(onChange).toHaveBeenCalledWith(new Set());
  });

  it("multi-selects accumulates options", () => {
    const onChange = vi.fn();
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set(["alpha"])} onChange={onChange} />);
    fireEvent.click(screen.getByText("Status"));
    fireEvent.click(screen.getByText("beta"));
    expect(onChange).toHaveBeenCalledWith(new Set(["alpha", "beta"]));
  });

  it("shows badge count when options selected", () => {
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set(["alpha", "beta"])} onChange={vi.fn()} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows 'Clear filter' button when selections exist", () => {
    const onChange = vi.fn();
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set(["alpha"])} onChange={onChange} />);
    fireEvent.click(screen.getByText("Status"));
    fireEvent.click(screen.getByText("Clear filter"));
    expect(onChange).toHaveBeenCalledWith(new Set());
  });

  it("uses labelMap to display option labels", () => {
    const labelMap = { alpha: "Alpha Label", beta: "Beta Label", gamma: "Gamma Label" };
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set()} onChange={vi.fn()} labelMap={labelMap} />);
    fireEvent.click(screen.getByText("Status"));
    expect(screen.getByText("Alpha Label")).toBeInTheDocument();
    expect(screen.getByText("Beta Label")).toBeInTheDocument();
  });

  it("renders search input when searchable", () => {
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set()} onChange={vi.fn()} searchable />);
    fireEvent.click(screen.getByText("Status"));
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("filters options by search query", () => {
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set()} onChange={vi.fn()} searchable />);
    fireEvent.click(screen.getByText("Status"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "alp" } });
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("shows 'No matches' when search yields no results", () => {
    render(<FilterDropdown label="Status" options={OPTIONS} selected={new Set()} onChange={vi.fn()} searchable />);
    fireEvent.click(screen.getByText("Status"));
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "zzz" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("uses custom renderOption when provided", () => {
    render(
      <FilterDropdown
        label="Status"
        options={OPTIONS}
        selected={new Set()}
        onChange={vi.fn()}
        renderOption={(v) => <span data-testid={`custom-${v}`}>{v.toUpperCase()}</span>}
      />,
    );
    fireEvent.click(screen.getByText("Status"));
    expect(screen.getByTestId("custom-alpha")).toBeInTheDocument();
    expect(screen.getByText("ALPHA")).toBeInTheDocument();
  });
});
