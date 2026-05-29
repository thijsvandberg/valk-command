import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { validateUrl } from "./LinkPopover";

// TipTap Editor is complex to mock fully in jsdom. We test the exported
// validateUrl helper directly and the component's rendering/interaction
// via a minimal editor mock.

function createMockEditor(attrs: Record<string, unknown> = {}) {
  const chainObj: Record<string, unknown> = {};
  const chain = () => chainObj;
  chainObj.focus = () => chainObj;
  chainObj.extendMarkRange = () => chainObj;
  chainObj.unsetLink = () => chainObj;
  chainObj.setLink = () => chainObj;
  chainObj.insertContent = () => chainObj;
  chainObj.command = () => chainObj;
  chainObj.run = vi.fn();

  return {
    getAttributes: vi.fn().mockReturnValue(attrs),
    state: {
      selection: { from: 0, to: 0 },
      doc: { textBetween: vi.fn().mockReturnValue("") },
    },
    chain,
    isActive: vi.fn().mockReturnValue(false),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

describe("validateUrl", () => {
  it("accepts http URLs", () => {
    expect(validateUrl("http://example.com")).toBe(true);
  });

  it("accepts https URLs", () => {
    expect(validateUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("accepts mailto URLs", () => {
    expect(validateUrl("mailto:user@example.com")).toBe(true);
  });

  it("rejects ftp URLs", () => {
    expect(validateUrl("ftp://files.example.com")).toBe(false);
  });

  it("rejects javascript: URLs", () => {
    expect(validateUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(validateUrl("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateUrl("")).toBe(false);
  });
});

describe("LinkPopover", () => {
  // Dynamic import to ensure the module augmentation loads cleanly
  let LinkPopover: typeof import("./LinkPopover").LinkPopover;

  beforeEach(async () => {
    const mod = await import("./LinkPopover");
    LinkPopover = mod.LinkPopover;
  });

  it("renders nothing when closed", () => {
    const editor = createMockEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(<LinkPopover editor={editor as any} open={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders URL and display text inputs when open", () => {
    const editor = createMockEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<LinkPopover editor={editor as any} open={true} onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText("https://")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Text to display")).toBeInTheDocument();
  });

  it("pre-fills URL from editor link attributes", () => {
    const editor = createMockEditor({ href: "https://example.com" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<LinkPopover editor={editor as any} open={true} onClose={vi.fn()} />);

    const urlInput = screen.getByPlaceholderText("https://") as HTMLInputElement;
    expect(urlInput.value).toBe("https://example.com");
  });

  it("shows Apply and Cancel buttons", () => {
    const editor = createMockEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<LinkPopover editor={editor as any} open={true} onClose={vi.fn()} />);

    expect(screen.getByText("Apply")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const editor = createMockEditor();
    const onClose = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<LinkPopover editor={editor as any} open={true} onClose={onClose} />);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows validation error for invalid protocol", () => {
    const editor = createMockEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<LinkPopover editor={editor as any} open={true} onClose={vi.fn()} />);

    const urlInput = screen.getByPlaceholderText("https://");
    fireEvent.change(urlInput, { target: { value: "ftp://files.example.com" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(screen.getByText("Only http, https, and mailto links are supported")).toBeInTheDocument();
  });

  it("clears URL when clear button is clicked", () => {
    const editor = createMockEditor({ href: "https://example.com" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<LinkPopover editor={editor as any} open={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Clear URL"));
    const urlInput = screen.getByPlaceholderText("https://") as HTMLInputElement;
    expect(urlInput.value).toBe("");
  });

  it("closes on Escape key", () => {
    const editor = createMockEditor();
    const onClose = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<LinkPopover editor={editor as any} open={true} onClose={onClose} />);

    const urlInput = screen.getByPlaceholderText("https://");
    fireEvent.keyDown(urlInput, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
