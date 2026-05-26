import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StoryPointPicker } from "./StoryPointPicker";

describe("StoryPointPicker", () => {
  it("renders a dot when value is null (unset)", () => {
    render(<StoryPointPicker value={null} onChange={() => {}} />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button.title).toBe("Set Story Points");
  });

  it("renders the numeric value when set", () => {
    render(<StoryPointPicker value={5} onChange={() => {}} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders dash when value is 0 (N/A)", () => {
    render(<StoryPointPicker value={0} onChange={() => {}} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByRole("button").title).toBe("N/A");
  });

  it("renders custom values (non-preset)", () => {
    render(<StoryPointPicker value={13} onChange={() => {}} />);
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByRole("button").title).toBe("Story Points: 13");
  });

  it("opens popover on click and shows preset options", () => {
    render(<StoryPointPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));

    // Should show all preset buttons + N/A + custom
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByTitle("Not applicable")).toBeInTheDocument();
    expect(screen.getByTitle("Custom value")).toBeInTheDocument();
  });

  it("calls onChange with selected preset value", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("3"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("calls onChange with 0 when N/A is clicked", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Not applicable"));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("calls onChange with null when clear is clicked", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Clear"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does not show clear button when value is null", () => {
    render(<StoryPointPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByTitle("Clear")).not.toBeInTheDocument();
  });

  it("supports keyboard shortcut for preset values", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(document, { key: "5" });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("supports keyboard shortcut for N/A (dash key)", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(document, { key: "-" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("supports keyboard shortcut for N/A (0 key)", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(document, { key: "0" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("supports Backspace/Delete to clear", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(document, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("closes on Escape", () => {
    render(<StoryPointPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("1")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("ignores non-preset number keys (e.g. 4, 6, 7)", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.keyDown(document, { key: "4" });
    fireEvent.keyDown(document, { key: "6" });
    fireEvent.keyDown(document, { key: "7" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows active state on currently selected preset", () => {
    render(<StoryPointPicker value={5} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));

    // The "5" button in the popover should have a box-shadow (active indicator)
    const buttons = screen.getAllByText("5");
    const popoverBtn = buttons[buttons.length - 1];
    expect(popoverBtn.style.boxShadow).toBeTruthy();
  });

  it("switches to custom input mode when # is clicked", () => {
    render(<StoryPointPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Custom value"));

    const input = screen.getByPlaceholderText("SP");
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("submits custom value on Enter", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Custom value"));

    const input = screen.getByPlaceholderText("SP");
    fireEvent.change(input, { target: { value: "13" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(13);
  });

  it("rejects invalid custom values (0 or negative)", () => {
    const onChange = vi.fn();
    render(<StoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Custom value"));

    const input = screen.getByPlaceholderText("SP");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("returns to preset mode on Escape in custom input", () => {
    render(<StoryPointPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Custom value"));

    expect(screen.getByPlaceholderText("SP")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText("SP"), { key: "Escape" });

    // Should be back to preset mode
    expect(screen.queryByPlaceholderText("SP")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  describe("size=lg", () => {
    it("renders SP label with value in trigger", () => {
      render(<StoryPointPicker value={5} onChange={() => {}} size="lg" />);
      expect(screen.getByText("SP")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("renders SP label with ? when unset", () => {
      render(<StoryPointPicker value={null} onChange={() => {}} size="lg" />);
      expect(screen.getByText("SP")).toBeInTheDocument();
      expect(screen.getByText("?")).toBeInTheDocument();
    });

    it("shows Story Points heading in popover", () => {
      render(<StoryPointPicker value={null} onChange={() => {}} size="lg" />);
      fireEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Story Points")).toBeInTheDocument();
    });

    it("calls onChange with selected value", () => {
      const onChange = vi.fn();
      render(<StoryPointPicker value={null} onChange={onChange} size="lg" />);
      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByText("3"));
      expect(onChange).toHaveBeenCalledWith(3);
    });
  });
});
