import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock BubbleMenu to simply render children (jsdom can't handle TipTap positioning)
vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="bubble-menu">{children}</div>,
}));

// Mock LinkPopover side-effect import
vi.mock("./LinkPopover", () => ({}));

function createMockEditor(attrs: Record<string, unknown> = { href: "https://example.com" }) {
  const chainObj: Record<string, unknown> = {};
  const chain = () => chainObj;
  chainObj.focus = () => chainObj;
  chainObj.extendMarkRange = () => chainObj;
  chainObj.unsetLink = () => chainObj;
  chainObj.run = vi.fn();

  return {
    getAttributes: vi.fn().mockReturnValue(attrs),
    state: { selection: { empty: true } },
    isActive: vi.fn().mockReturnValue(true),
    chain,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

describe("LinkFloatingToolbar", () => {
  let LinkFloatingToolbar: typeof import("./LinkFloatingToolbar").LinkFloatingToolbar;

  beforeEach(async () => {
    const mod = await import("./LinkFloatingToolbar");
    LinkFloatingToolbar = mod.LinkFloatingToolbar;
  });

  it("renders four action buttons", () => {
    const editor = createMockEditor();
    render(<LinkFloatingToolbar editor={editor as any} />);

    expect(screen.getByLabelText("Edit link")).toBeInTheDocument();
    expect(screen.getByLabelText("Unlink")).toBeInTheDocument();
    expect(screen.getByLabelText("Open in new tab")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy URL")).toBeInTheDocument();
  });

  it("emits openLinkPopover event when edit is clicked", () => {
    const editor = createMockEditor();
    render(<LinkFloatingToolbar editor={editor as any} />);

    fireEvent.click(screen.getByLabelText("Edit link"));
    expect(editor.emit).toHaveBeenCalledWith("openLinkPopover", {});
  });

  it("calls unsetLink when unlink is clicked", () => {
    const editor = createMockEditor();
    render(<LinkFloatingToolbar editor={editor as any} />);

    fireEvent.click(screen.getByLabelText("Unlink"));
    expect(editor.chain().extendMarkRange).toBeDefined();
  });

  it("opens URL in new tab when open button is clicked", () => {
    const editor = createMockEditor();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<LinkFloatingToolbar editor={editor as any} />);

    fireEvent.click(screen.getByLabelText("Open in new tab"));
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("copies URL to clipboard when copy button is clicked", async () => {
    const editor = createMockEditor();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    render(<LinkFloatingToolbar editor={editor as any} />);

    fireEvent.click(screen.getByLabelText("Copy URL"));
    expect(writeTextMock).toHaveBeenCalledWith("https://example.com");
  });
});
