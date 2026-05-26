import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LabelPicker } from "./LabelPicker";

const MOCK_LABELS = ["backend", "bug", "design", "frontend", "infrastructure", "urgent"];

vi.mock("swr", () => ({
  __esModule: true,
  default: (key: string | null) => {
    if (!key) return { data: undefined };
    return { data: { labels: MOCK_LABELS } };
  },
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
}));

describe("LabelPicker", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockClear();
  });

  it("renders 'None' when value is empty", () => {
    render(<LabelPicker value={[]} onChange={onChange} />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("renders label chips when value has entries", () => {
    render(<LabelPicker value={["bug", "urgent"]} onChange={onChange} />);
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("opens popover on click and shows search input and labels", () => {
    render(<LabelPicker value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByPlaceholderText("Search labels...")).toBeInTheDocument();
    expect(screen.getByText("backend")).toBeInTheDocument();
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("search filters labels by text", () => {
    render(<LabelPicker value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByPlaceholderText("Search labels...");
    fireEvent.change(input, { target: { value: "front" } });

    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.queryByText("backend")).not.toBeInTheDocument();
    expect(screen.queryByText("bug")).not.toBeInTheDocument();
  });

  it("shows 'No labels found' when search matches nothing", () => {
    render(<LabelPicker value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    const input = screen.getByPlaceholderText("Search labels...");
    fireEvent.change(input, { target: { value: "zzzzzzz" } });

    expect(screen.getByText("No labels found")).toBeInTheDocument();
  });

  it("calls onChange with added label when unselected label is clicked", () => {
    render(<LabelPicker value={["bug"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("frontend"));
    expect(onChange).toHaveBeenCalledWith(["bug", "frontend"]);
  });

  it("calls onChange with removed label when selected label is clicked", () => {
    render(<LabelPicker value={["bug", "frontend"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    // "bug" appears both as a Tag chip and a popover row; click the popover row
    const bugInPopover = screen.getAllByText("bug").find(
      (el) => el.closest("button[class*='hover:bg-hover-list-item']"),
    )!;
    fireEvent.click(bugInPopover);
    expect(onChange).toHaveBeenCalledWith(["frontend"]);
  });

  it("popover stays open after toggling (multi-select behavior)", () => {
    render(<LabelPicker value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("bug"));

    // Popover should still be visible
    expect(screen.getByPlaceholderText("Search labels...")).toBeInTheDocument();
    expect(screen.getByText("frontend")).toBeInTheDocument();
  });

  it("shows checkmark next to selected labels", () => {
    render(<LabelPicker value={["bug"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));

    // "bug" row should have font-medium class (selected style)
    const bugButton = screen.getAllByText("bug").find(
      (el) => el.closest("button[class*='hover:bg-hover-list-item']"),
    );
    expect(bugButton?.className).toContain("font-medium");

    // "frontend" should not have font-medium
    const frontendButton = screen.getByText("frontend");
    expect(frontendButton.className).not.toContain("font-medium");
  });
});
