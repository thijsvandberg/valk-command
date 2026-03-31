import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportDiffAsMarkdown } from "./export-diff";

describe("exportDiffAsMarkdown", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn().mockReturnValue("blob:test-url");
    revokeObjectURLSpy = vi.fn();
    clickSpy = vi.fn();

    Object.defineProperty(globalThis, "URL", {
      value: {
        createObjectURL: createObjectURLSpy,
        revokeObjectURL: revokeObjectURLSpy,
      },
      writable: true,
    });

    Object.defineProperty(globalThis, "Blob", {
      value: class MockBlob {
        content: string[];
        options: { type: string };
        constructor(content: string[], options: { type: string }) {
          this.content = content;
          this.options = options;
        }
      },
      writable: true,
    });

    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click: clickSpy,
    } as unknown as HTMLElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers a download with correct filename", () => {
    exportDiffAsMarkdown({
      ticketKey: "VPL-100",
      oldText: "old content",
      newText: "new content",
      oldLabel: "v1",
      newLabel: "v2",
    });

    expect(clickSpy).toHaveBeenCalledOnce();
    const anchor = (document.createElement as ReturnType<typeof vi.fn>).mock
      .results[0].value;
    expect(anchor.download).toBe("VPL-100-diff-v1-v2.md");
  });

  it("creates a blob with markdown content type", () => {
    exportDiffAsMarkdown({
      ticketKey: "VPL-100",
      oldText: "old",
      newText: "new",
      oldLabel: "v1",
      newLabel: "v2",
    });

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
  });
});
