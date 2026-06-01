import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// LinkPopover renders a TipTap-driven popover that jsdom can't position; stub it out.
vi.mock("./LinkPopover", () => ({
  LinkPopover: () => null,
}));

// A chain proxy that returns itself for any method (focus/toggleX/...) and
// records run() calls, so we can assert a command chain executed.
function createMockEditor(activeMarks: Record<string, boolean> = {}) {
  const run = vi.fn();
  const chainObj: Record<string, unknown> = { run };
  const chainProxy: Record<string, unknown> = new Proxy(chainObj, {
    get(target, prop: string) {
      if (prop === "run") return run;
      return () => chainProxy;
    },
  });

  return {
    chain: () => chainProxy,
    isActive: vi.fn((name: string) => activeMarks[name] ?? false),
    getAttributes: vi.fn().mockReturnValue({}),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    __run: run,
  };
}

describe("Toolbar inline code button", () => {
  let Toolbar: typeof import("./Toolbar").Toolbar;

  beforeEach(async () => {
    const mod = await import("./Toolbar");
    Toolbar = mod.Toolbar;
  });

  it("hides the inline code button until the 'more' row is opened", () => {
    const editor = createMockEditor();
    render(<Toolbar editor={editor as any} mode="rich" />);

    expect(screen.queryByLabelText("Inline code")).toBeNull();

    fireEvent.click(screen.getByLabelText("More formatting options"));

    expect(screen.getByLabelText("Inline code")).toBeInTheDocument();
  });

  it("renders inline code and code block as distinct buttons", () => {
    const editor = createMockEditor();
    render(<Toolbar editor={editor as any} mode="rich" />);

    fireEvent.click(screen.getByLabelText("More formatting options"));

    const inlineCode = screen.getByLabelText("Inline code");
    const codeBlock = screen.getByLabelText("Code block");
    expect(inlineCode).toBeInTheDocument();
    expect(codeBlock).toBeInTheDocument();
    expect(inlineCode).not.toBe(codeBlock);
  });

  it("runs a command chain when the inline code button is clicked", () => {
    const editor = createMockEditor();
    render(<Toolbar editor={editor as any} mode="rich" />);

    fireEvent.click(screen.getByLabelText("More formatting options"));
    fireEvent.click(screen.getByLabelText("Inline code"));

    expect(editor.__run).toHaveBeenCalled();
  });

  it("reflects the active state of the inline code mark via aria-pressed", () => {
    const editor = createMockEditor({ code: true });
    render(<Toolbar editor={editor as any} mode="rich" />);

    fireEvent.click(screen.getByLabelText("More formatting options"));

    expect(screen.getByLabelText("Inline code")).toHaveAttribute("aria-pressed", "true");
    expect(editor.isActive).toHaveBeenCalledWith("code");
  });

  it("shows a tooltip with the keyboard shortcut on hover", () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor();
      render(<Toolbar editor={editor as any} mode="rich" />);

      // Tooltip content is portaled and only appears after the hover delay.
      const bold = screen.getByLabelText("More formatting options");
      fireEvent.click(bold);
      const inlineCode = screen.getByLabelText("Inline code");

      expect(screen.queryByText("⌘E")).toBeNull();
      fireEvent.mouseEnter(inlineCode.parentElement as HTMLElement);
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText("⌘E")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
