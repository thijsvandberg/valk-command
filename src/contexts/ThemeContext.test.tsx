import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";

function TestConsumer({ onState }: { onState: (state: ReturnType<typeof useTheme>) => void }) {
  const state = useTheme();
  onState(state);
  return null;
}

function renderWithProvider(onState: (state: ReturnType<typeof useTheme>) => void) {
  return render(
    <ThemeProvider>
      <TestConsumer onState={onState} />
    </ThemeProvider>,
  );
}

const store: Record<string, string> = {};
const mockStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};

Object.defineProperty(window, "localStorage", { value: mockStorage, writable: true });

describe("ThemeContext", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
    document.documentElement.removeAttribute("data-theme");
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("provides dark theme by default", () => {
    let state: ReturnType<typeof useTheme> | null = null;
    renderWithProvider((s) => { state = s; });
    expect(state!.theme).toBe("dark");
  });

  it("respects stored theme from localStorage", () => {
    store["theme"] = "light";
    let state: ReturnType<typeof useTheme> | null = null;
    renderWithProvider((s) => { state = s; });
    expect(state!.theme).toBe("light");
  });

  it("setTheme updates theme and writes to localStorage", () => {
    let state: ReturnType<typeof useTheme> | null = null;
    renderWithProvider((s) => { state = s; });

    act(() => {
      state!.setTheme("light");
    });

    expect(store["theme"]).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggleTheme switches dark to light", () => {
    let state: ReturnType<typeof useTheme> | null = null;
    renderWithProvider((s) => { state = s; });

    expect(state!.theme).toBe("dark");

    act(() => {
      state!.toggleTheme();
    });

    expect(store["theme"]).toBe("light");
  });

  it("useTheme throws outside provider", () => {
    expect(() => {
      render(<TestConsumer onState={() => {}} />);
    }).toThrow("useTheme must be used within ThemeProvider");
  });
});
