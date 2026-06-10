import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TitleInput } from "./TitleInput";

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void;

describe("TitleInput", () => {
  it("renders an input with the provided value", () => {
    render(<TitleInput value="My Story Title" onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("My Story Title")).toBeInTheDocument();
  });

  it("calls onChange when input changes", () => {
    const onChange = vi.fn();
    render(<TitleInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New Title" } });

    expect(onChange).toHaveBeenCalledWith("New Title");
  });

  it("renders with default placeholder", () => {
    render(<TitleInput value="" onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText("Story title (optional, AI will suggest)")).toBeInTheDocument();
  });

  it("renders with custom placeholder when provided", () => {
    render(<TitleInput value="" onChange={vi.fn()} placeholder="Enter story title..." />);

    expect(screen.getByPlaceholderText("Enter story title...")).toBeInTheDocument();
  });

  it("renders an auto-growing textarea for the title", () => {
    render(<TitleInput value="Test" onChange={vi.fn()} />);

    const input = screen.getByRole("textbox");
    expect(input.tagName).toBe("TEXTAREA");
  });

  it("reflects updated value on re-render", () => {
    const { rerender } = render(<TitleInput value="First" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("First")).toBeInTheDocument();

    rerender(<TitleInput value="Updated" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Updated")).toBeInTheDocument();
  });

  it("does not render the suggest button when onSuggest is omitted", () => {
    render(<TitleInput value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /suggest titles/i })).toBeNull();
  });

  it("renders the suggest button and fires onSuggest when clicked", () => {
    const onSuggest = vi.fn().mockResolvedValue(true);
    render(<TitleInput value="" onChange={vi.fn()} onSuggest={onSuggest} />);

    fireEvent.click(screen.getByRole("button", { name: /suggest titles/i }));
    expect(onSuggest).toHaveBeenCalledTimes(1);
  });

  it("disables the suggest button when suggestDisabled is true", () => {
    const onSuggest = vi.fn();
    render(<TitleInput value="" onChange={vi.fn()} onSuggest={onSuggest} suggestDisabled />);

    const button = screen.getByRole("button", { name: /suggest titles/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSuggest).not.toHaveBeenCalled();
  });

  describe("auto-grow on width change", () => {
    let resizeCallback: ResizeCallback | undefined;
    let observedEl: Element | undefined;

    beforeEach(() => {
      resizeCallback = undefined;
      observedEl = undefined;
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(cb: ResizeCallback) {
            resizeCallback = cb;
          }
          observe(el: Element) {
            observedEl = el;
          }
          disconnect() {}
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("observes the title textarea", () => {
      render(<TitleInput value="A long title that may wrap" onChange={vi.fn()} />);
      expect(observedEl).toBe(screen.getByRole("textbox"));
    });

    it("recomputes height when the field width changes", () => {
      render(<TitleInput value="A long title that wraps onto two lines" onChange={vi.fn()} />);
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      // jsdom reports scrollHeight as 0, so simulate a wrapped two-line content.
      Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 64 });

      resizeCallback?.([{ contentRect: { width: 352 } }]);

      expect(textarea.style.height).toBe("64px");
    });

    it("ignores callbacks that do not change the width (avoids resize loops)", () => {
      render(<TitleInput value="A long title that wraps onto two lines" onChange={vi.fn()} />);
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

      // First callback establishes the width and applies a height.
      Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 64 });
      resizeCallback?.([{ contentRect: { width: 352 } }]);
      expect(textarea.style.height).toBe("64px");

      // A height-only callback (same width) must not re-run fitHeight, which
      // would otherwise reset height to "auto" and feed an infinite loop.
      Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 999 });
      resizeCallback?.([{ contentRect: { width: 352 } }]);
      expect(textarea.style.height).toBe("64px");
    });
  });
});
