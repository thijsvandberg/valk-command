import { describe, it, expect, vi, beforeEach } from "vitest";
import { copyAsMarkdown, copyAsRTF } from "./clipboard";

// jsdom does not provide ClipboardItem
if (typeof globalThis.ClipboardItem === "undefined") {
  (globalThis as Record<string, unknown>).ClipboardItem = class ClipboardItem {
    constructor(public items: Record<string, Blob>) {}
  };
}

describe("copyAsMarkdown", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("calls clipboard.writeText and returns true", async () => {
    const result = await copyAsMarkdown("# Hello");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("# Hello");
    expect(result).toBe(true);
  });

  it("returns false when writeText throws", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
    const result = await copyAsMarkdown("test");
    expect(result).toBe(false);
  });
});

describe("copyAsRTF", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("calls clipboard.write with HTML and plain text blobs", async () => {
    const result = await copyAsRTF("**bold**");
    expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);

    const call = vi.mocked(navigator.clipboard.write).mock.calls[0];
    const items = call[0] as ClipboardItem[];
    expect(items).toHaveLength(1);
  });

  it("falls back to copyAsMarkdown when clipboard.write throws", async () => {
    vi.mocked(navigator.clipboard.write).mockRejectedValue(new Error("unsupported"));
    const result = await copyAsRTF("text");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("text");
    expect(result).toBe(true);
  });
});
