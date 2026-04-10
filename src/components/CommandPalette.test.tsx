import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommandPalette } from "./CommandPalette";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: vi.fn() })),
}));

// Mock fuse.js to keep tests synchronous
vi.mock("fuse.js", () => {
  return {
    default: class Fuse<T> {
      private items: T[];
      private keys: string[];
      constructor(items: T[], opts?: { keys?: (string | { name: string })[] }) {
        this.items = items;
        this.keys = (opts?.keys ?? []).map((k) => (typeof k === "string" ? k : k.name));
      }
      search(query: string, opts?: { limit?: number }) {
        const q = query.toLowerCase();
        const results = this.items.filter((item) => {
          return this.keys.some((key) => {
            const val = (item as Record<string, unknown>)[key];
            if (typeof val === "string") return val.toLowerCase().includes(q);
            if (Array.isArray(val)) return val.some((v) => String(v).toLowerCase().includes(q));
            return false;
          });
        });
        return results.slice(0, opts?.limit ?? 10).map((item) => ({ item, score: 0.1 }));
      }
    },
  };
});

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPush.mockClear();
    // Mock fetch for ticket/conversation searches
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/api/search/local")) {
        // Only return results for queries that make sense
        if (urlStr.includes("login") || urlStr.includes("bug") || urlStr.includes("VPL")) {
          return new Response(JSON.stringify({ results: [
            { key: "VPL-123", summary: "Fix login bug", status: "In Progress", issueType: "Bug" },
          ] }));
        }
        return new Response(JSON.stringify({ results: [] }));
      }
      if (urlStr.includes("/api/conversations") && !urlStr.includes("POST")) {
        return new Response(JSON.stringify([
          { id: "conv-1", title: "Sprint planning", createdAt: "2026-04-01" },
        ]));
      }
      return new Response(JSON.stringify({}));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not render when closed", () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument();
  });

  it("opens with Cmd+K and shows search input", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument();
  });

  it("shows page results by default when open", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Sprint Board")).toBeInTheDocument();
  });

  it("shows action results by default when open", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByText("Sync Jira")).toBeInTheDocument();
    expect(screen.getByText("New Conversation")).toBeInTheDocument();
    expect(screen.getByText("Toggle Sidebar")).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
    });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument();
    }, { timeout: 300 });
  });

  it("navigates to a page on Enter", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    // First result is Dashboard at index 0
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    }, { timeout: 300 });
  });

  it("navigates with arrow keys", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    // Move down to Chat (index 1)
    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat");
    }, { timeout: 300 });
  });

  it("filters pages by query", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "board" } });
    });

    await waitFor(() => {
      expect(screen.getByText("Sprint Board")).toBeInTheDocument();
    });
  });

  it("shows ticket results after debounce", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "login" } });
    });

    // Advance past the debounce timer
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("VPL-123")).toBeInTheDocument();
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    });
  });

  it("closes on backdrop click", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    // The backdrop is the outermost fixed div
    const backdrop = screen.getByPlaceholderText(/search pages/i).closest(".fixed");
    if (backdrop) {
      await act(async () => {
        fireEvent.mouseDown(backdrop, { target: backdrop });
      });
    }

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument();
    }, { timeout: 300 });
  });

  it("shows empty state when no results match", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "zzzznonexistent" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
  });
});
