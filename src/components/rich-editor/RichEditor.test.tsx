import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RichEditor, normalizeMarkdownForEditor } from "./RichEditor";

// TipTap requires a DOM environment but jsdom has limitations with contentEditable.
// We test the component renders, the mode toggle works, and the markdown textarea.

const mockStorage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => Object.keys(mockStorage).forEach((k) => delete mockStorage[k]),
    },
    writable: true,
  });
});

describe("normalizeMarkdownForEditor", () => {
  // Bold cases
  it("strips **:** corrupted form to bare colon", () => {
    expect(normalizeMarkdownForEditor("**:**")).toBe(":");
  });

  it("moves colon outside bold: **word:** → **word**:", () => {
    expect(normalizeMarkdownForEditor("**Feature flag:**")).toBe("**Feature flag**:");
  });

  it("preserves bold without trailing colon", () => {
    expect(normalizeMarkdownForEditor("**hello**")).toBe("**hello**");
  });

  // Italic cases
  it("strips *:* stray italic colon to bare colon", () => {
    expect(normalizeMarkdownForEditor("*:*")).toBe(":");
  });

  it("moves colon outside italic: *word:* → *word*:", () => {
    expect(normalizeMarkdownForEditor("*Feature flag:*")).toBe("*Feature flag*:");
  });

  it("strips orphan * after italic+colon: *word*:* → *word*:", () => {
    expect(normalizeMarkdownForEditor("*Feature flag*:*")).toBe("*Feature flag*:");
  });

  it("preserves italic without trailing colon", () => {
    expect(normalizeMarkdownForEditor("*hello*")).toBe("*hello*");
  });

  it("does not modify bold+italic (***text***)", () => {
    expect(normalizeMarkdownForEditor("***bold italic***")).toBe("***bold italic***");
  });

  it("handles multiple occurrences in one string", () => {
    const input = "- **Feature flag:** value\n- *Another:* text";
    const expected = "- **Feature flag**: value\n- *Another*: text";
    expect(normalizeMarkdownForEditor(input)).toBe(expected);
  });

  it("returns plain text unchanged", () => {
    expect(normalizeMarkdownForEditor("plain text here")).toBe("plain text here");
  });
});

// The mode toggle ("Markdown" / "Rich Text") lives in the expandable second
// toolbar row, so it is only visible after opening the "More options" menu.
function openMore() {
  fireEvent.click(screen.getByLabelText("More formatting options"));
}

describe("RichEditor", () => {
  it("renders without crashing", () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichEditor value="Hello" onChange={onChange} />
    );
    expect(container.querySelector(".rich-editor-root")).toBeTruthy();
  });

  it("renders mode toggle button", () => {
    render(<RichEditor value="" onChange={vi.fn()} />);
    // Default is rich mode; the toggle shows "Markdown" to switch to it
    openMore();
    expect(screen.getByText("Markdown")).toBeTruthy();
  });

  it("starts in rich text mode by default", () => {
    const { container } = render(
      <RichEditor value="Test" onChange={vi.fn()} />
    );
    expect(container.querySelector(".rich-editor-wrapper")).toBeTruthy();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("switches to markdown mode and shows textarea", () => {
    const { container } = render(
      <RichEditor value="Some content" onChange={vi.fn()} />
    );

    openMore();
    fireEvent.click(screen.getByText("Markdown"));

    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();
    expect(textarea?.value).toBe("Some content");
  });

  it("calls onChange when typing in markdown mode", () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichEditor value="" onChange={onChange} />
    );

    openMore();
    fireEvent.click(screen.getByText("Markdown"));
    const textarea = container.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "# New content" } });

    expect(onChange).toHaveBeenCalledWith("# New content");
  });

  it("persists mode preference in localStorage", () => {
    render(<RichEditor value="" onChange={vi.fn()} />);

    openMore();
    fireEvent.click(screen.getByText("Markdown"));
    expect(localStorage.getItem("rich-editor-mode")).toBe("markdown");

    fireEvent.click(screen.getByText("Rich Text"));
    expect(localStorage.getItem("rich-editor-mode")).toBe("rich");
  });

  it("restores mode from localStorage", () => {
    localStorage.setItem("rich-editor-mode", "markdown");
    const { container } = render(
      <RichEditor value="Stored" onChange={vi.fn()} />
    );

    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("renders with custom className", () => {
    const { container } = render(
      <RichEditor value="" onChange={vi.fn()} className="custom-class" />
    );
    expect(
      container.querySelector(".rich-editor-root.custom-class")
    ).toBeTruthy();
  });

  it("applies minHeight to markdown textarea", () => {
    const { container } = render(
      <RichEditor value="" onChange={vi.fn()} minHeight={300} />
    );

    openMore();
    fireEvent.click(screen.getByText("Markdown"));
    const textarea = container.querySelector("textarea");
    expect(textarea?.style.minHeight).toBe("300px");
  });

  it("shows placeholder in markdown mode", () => {
    const { container } = render(
      <RichEditor
        value=""
        onChange={vi.fn()}
        placeholder="Write something..."
      />
    );

    openMore();
    fireEvent.click(screen.getByText("Markdown"));
    const textarea = container.querySelector("textarea");
    expect(textarea?.placeholder).toBe("Write something...");
  });
});
