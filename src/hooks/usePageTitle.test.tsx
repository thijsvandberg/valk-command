import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePageTitle } from "./usePageTitle";

beforeEach(() => {
  vi.restoreAllMocks();
  document.title = "";
});

describe("usePageTitle", () => {
  it("sets document.title with the Valk Command suffix", () => {
    renderHook(() => usePageTitle("Dashboard"));

    expect(document.title).toBe("Dashboard | Valk Command");
  });

  it("returns a <title> element with the full title", () => {
    const { result } = renderHook(() => usePageTitle("Sprint Board"));

    const el = result.current as React.ReactElement<{ children: string }>;
    expect(el).toBeTruthy();
    expect(el.type).toBe("title");
    expect(el.props.children).toBe("Sprint Board | Valk Command");
  });

  it("updates document.title when the title prop changes", () => {
    const { rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: "Chat" },
    });

    expect(document.title).toBe("Chat | Valk Command");

    rerender({ title: "Settings" });

    expect(document.title).toBe("Settings | Valk Command");
  });

  it("handles an empty string title", () => {
    const { result } = renderHook(() => usePageTitle(""));

    // Browser trims the leading space in document.title
    expect(document.title).toBe("| Valk Command");
    // The React element still contains the raw concatenation
    const el = result.current as React.ReactElement<{ children: string }>;
    expect(el.props.children).toBe(" | Valk Command");
  });
});
