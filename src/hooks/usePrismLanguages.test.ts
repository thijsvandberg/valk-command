import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockExtractCodeLanguages = vi.fn();
const mockEnsureLanguages = vi.fn();

vi.mock("@/components/ticket-detail/prismLoader", () => ({
  extractCodeLanguages: (...args: unknown[]) => mockExtractCodeLanguages(...args),
  ensureLanguages: (...args: unknown[]) => mockEnsureLanguages(...args),
}));

import { usePrismLanguages } from "./usePrismLanguages";

describe("usePrismLanguages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractCodeLanguages.mockReturnValue([]);
    mockEnsureLanguages.mockResolvedValue(false);
  });

  it("returns 0 when markdown is null", () => {
    const { result } = renderHook(() => usePrismLanguages(null));
    expect(result.current).toBe(0);
  });

  it("returns 0 when markdown is undefined", () => {
    const { result } = renderHook(() => usePrismLanguages(undefined));
    expect(result.current).toBe(0);
  });

  it("returns 0 when no code languages found", () => {
    mockExtractCodeLanguages.mockReturnValue([]);
    const { result } = renderHook(() => usePrismLanguages("# Just a heading"));
    expect(result.current).toBe(0);
    expect(mockEnsureLanguages).not.toHaveBeenCalled();
  });

  it("increments generation when new languages are loaded", async () => {
    mockExtractCodeLanguages.mockReturnValue(["typescript"]);
    mockEnsureLanguages.mockResolvedValue(true);

    const { result } = renderHook(() => usePrismLanguages("```typescript\nconst x = 1;\n```"));

    await waitFor(() => {
      expect(result.current).toBe(1);
    });
    expect(mockEnsureLanguages).toHaveBeenCalledWith(["typescript"]);
  });

  it("does not increment when ensureLanguages returns false", async () => {
    mockExtractCodeLanguages.mockReturnValue(["javascript"]);
    mockEnsureLanguages.mockResolvedValue(false);

    const { result } = renderHook(() => usePrismLanguages("```javascript\nlet x;\n```"));

    // Give the promise time to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current).toBe(0);
  });
});
