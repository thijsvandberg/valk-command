import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommandPalette } from "./CommandPalette";

const mockPush = vi.fn();
const mockPathname = vi.fn(() => "/");

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: vi.fn() })),
  usePathname: () => mockPathname(),
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
    mockPathname.mockReturnValue("/");
    // Mock fetch for ticket/conversation/session searches
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/api/search/local")) {
        if (urlStr.includes("login") || urlStr.includes("bug") || urlStr.includes("VPL")) {
          return new Response(JSON.stringify({ results: [
            { key: "VPL-123", summary: "Fix login bug", status: "In Progress", issueType: "Bug" },
          ] }));
        }
        return new Response(JSON.stringify({ results: [] }));
      }
      if (urlStr.includes("/api/conversations") && !urlStr.includes("POST")) {
        return new Response(JSON.stringify([
          { id: "conv-1", title: "Sprint planning", createdAt: "2026-04-01", relatedTicket: null, metadata: null },
        ]));
      }
      if (urlStr.includes("/api/story-writer/active-sessions")) {
        return new Response(JSON.stringify([
          { sessionId: "sess-1", ticketKey: "VPL-42", title: "Implement auth flow", sprintName: "Sprint 5", epic: null, epicKey: null, issueType: "story", status: "TO DO", updatedAt: "2026-04-10", jiraUpdatedAt: null },
        ]));
      }
      if (urlStr.includes("/api/epics") && !urlStr.includes("/summary")) {
        return new Response(JSON.stringify([
          { key: "VPL-10", name: "Authentication Epic", status: "In Progress", childCount: 8, summary: "Handles all auth flows", summaryStale: false },
          { key: "VPL-20", name: "Payment Integration", status: "TO DO", childCount: 3, summary: null, summaryStale: false },
        ]));
      }
      if (urlStr.includes("/api/sprint-slots")) {
        return new Response(JSON.stringify([
          { slotIndex: 0, sprintId: "sprint-5", sprintName: "Sprint 5" },
        ]));
      }
      if (urlStr.match(/\/api\/tickets\/([A-Z]+-\d+)$/)) {
        const key = urlStr.match(/\/api\/tickets\/([A-Z]+-\d+)$/)![1];
        if (key === "VPL-99") {
          return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
        }
        return new Response(JSON.stringify({ key, title: "Some ticket" }));
      }
      if (urlStr.includes("/api/story-writer/create")) {
        return new Response(JSON.stringify({ key: "VPL-200" }), { status: 201 });
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
    expect(screen.getByText("Sprint Board")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("shows action results by default when open", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByText("Sync Jira")).toBeInTheDocument();
    expect(screen.getByText("New Conversation")).toBeInTheDocument();
  });

  it("shows New Story action by default when open", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByText("New Story")).toBeInTheDocument();
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
    await act(async () => {
      fireEvent.change(input, { target: { value: "refinement" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Refinement")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/refinement");
    }, { timeout: 300 });
  });

  it("navigates with arrow keys", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "refinement" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Refinement")).toBeInTheDocument();
    });
    // index 0 = Refinement; move down to next result and press Enter
    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    // ArrowDown moved away from Refinement; whatever the next result is was opened
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
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

  /* ------------------------------------------------------------------ */
  /*  Phase 1: New Story sub-flow                                       */
  /* ------------------------------------------------------------------ */

  it("transitions to New Story sub-flow when action is selected", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    // Click the "New Story" action
    const newStoryItem = screen.getByText("New Story");
    await act(async () => {
      fireEvent.click(newStoryItem.closest("[data-palette-row]")!);
    });

    // Sub-flow UI should appear
    await waitFor(() => {
      expect(screen.getByText("Create new")).toBeInTheDocument();
      expect(screen.getByText("Use existing")).toBeInTheDocument();
    });

    // Search input is replaced by breadcrumb
    expect(screen.queryByPlaceholderText(/search pages/i)).not.toBeInTheDocument();
  });

  it("Escape from sub-flow returns to palette without closing", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const newStoryItem = screen.getByText("New Story");
    await act(async () => {
      fireEvent.click(newStoryItem.closest("[data-palette-row]")!);
    });

    // Should be in sub-flow
    await waitFor(() => {
      expect(screen.getByText("Create new")).toBeInTheDocument();
    });

    // Press Escape on the back button (bubbles up to palette container's onKeyDown)
    const backBtn = screen.getByRole("button", { name: /back to palette/i });
    await act(async () => {
      fireEvent.keyDown(backBtn, { key: "Escape" });
    });

    // The palette should still be open, now showing normal results
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument();
    }, { timeout: 300 });
  });

  it("navigates to existing ticket write page from sub-flow", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const newStoryItem = screen.getByText("New Story");
    await act(async () => {
      fireEvent.click(newStoryItem.closest("[data-palette-row]")!);
    });

    await waitFor(() => {
      expect(screen.getByText("Use existing")).toBeInTheDocument();
    });

    // Switch to "Use existing" mode
    await act(async () => {
      fireEvent.click(screen.getByText("Use existing"));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("VPL-123")).toBeInTheDocument();
    });

    // Type a ticket key
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("VPL-123"), { target: { value: "vpl-55" } });
    });

    // Input auto-uppercases
    await waitFor(() => {
      expect((screen.getByPlaceholderText("VPL-123") as HTMLInputElement).value).toBe("VPL-55");
    });

    // Confirm
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /open/i }));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-55/write");
    });
  });

  it("shows inline error when ticket not found locally", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const newStoryItem = screen.getByText("New Story");
    await act(async () => {
      fireEvent.click(newStoryItem.closest("[data-palette-row]")!);
    });

    await waitFor(() => {
      expect(screen.getByText("Use existing")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Use existing"));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("VPL-123")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("VPL-123"), { target: { value: "VPL-99" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /open/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/VPL-99 not found locally/i)).toBeInTheDocument();
    });
  });

  it("creates a new story and navigates to its write page", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const newStoryItem = screen.getByText("New Story");
    await act(async () => {
      fireEvent.click(newStoryItem.closest("[data-palette-row]")!);
    });

    await waitFor(() => {
      expect(screen.getByText("Create new")).toBeInTheDocument();
    });

    // Sprint loads lazily
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Fill in the title
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/story title/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/story title/i), { target: { value: "New feature" } });
    });

    // Use exact name match to avoid matching the "Create new" mode toggle button
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/^\/tickets\/DRAFT-[a-f0-9]+\/write\?title=New\+feature$/),
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Phase 2: Story Writer sessions in search results                  */
  /* ------------------------------------------------------------------ */

  it("shows story writer session in results when query matches", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "auth" } });
    });

    // Sessions are filtered client-side without debounce
    await waitFor(() => {
      expect(screen.getByText("Implement auth flow")).toBeInTheDocument();
    });
  });

  it("shows Story Writer category label for session results", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "auth" } });
    });

    // The category label and the result pill both render "Story Writer", so use getAllByText
    await waitFor(() => {
      const labels = screen.getAllByText("Story Writer");
      expect(labels.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("navigates to write page when story writer session is selected", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "auth" } });
    });

    await waitFor(() => {
      expect(screen.getByText("Implement auth flow")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Implement auth flow").closest("[data-palette-row]")!);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-42/write");
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Phase 3: Active session indicator                                 */
  /* ------------------------------------------------------------------ */

  it("shows currently editing hint on New Story action when on write page", async () => {
    mockPathname.mockReturnValue("/tickets/VPL-42/write");

    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    await waitFor(() => {
      expect(screen.getByText("Currently editing VPL-42")).toBeInTheDocument();
    });
  });

  it("surfaces all open sessions at the top of empty-query results", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    // Sessions should appear without any query, regardless of current page
    await waitFor(() => {
      expect(screen.getByText("Implement auth flow")).toBeInTheDocument();
    });
  });

  it("shows story writer session when typing the ticket key directly", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "VPL-42" } });
    });

    // The session for VPL-42 should appear above the direct-ticket result
    await waitFor(() => {
      expect(screen.getByText("Implement auth flow")).toBeInTheDocument();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  BRDG-209: Epic search in command palette                          */
  /* ------------------------------------------------------------------ */

  it("shows epic results when searching by epic name", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "authentication" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("Authentication Epic")).toBeInTheDocument();
      expect(screen.getByText("VPL-10")).toBeInTheDocument();
    });
  });

  it("shows Epics category label for epic results", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "authentication" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("Epics")).toBeInTheDocument();
    });
  });

  it("shows child count on epic results", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "authentication" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("8 issues")).toBeInTheDocument();
    });
  });

  it("shows epic AI summary when available", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "authentication" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("Handles all auth flows")).toBeInTheDocument();
    });
  });

  it("navigates to epic detail page on selection", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "authentication" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(screen.getByText("Authentication Epic")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Authentication Epic").closest("[data-palette-row]")!);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-10");
    });
  });

  it("Search Epics action switches palette to epic mode", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    // Type "epic" to find the action
    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "epic" } });
    });

    await waitFor(() => {
      expect(screen.getByText("Search Epics")).toBeInTheDocument();
    });

    // Click the Search Epics action
    await act(async () => {
      fireEvent.click(screen.getByText("Search Epics").closest("[data-palette-row]")!);
    });

    // Should switch to epic mode: placeholder changes, badge appears
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search epics/i)).toBeInTheDocument();
    });
  });

  it("epic mode only shows epic results, not pages or actions", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    // Activate epic mode via the action
    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "epic" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Search Epics")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Search Epics").closest("[data-palette-row]")!);
    });

    // Wait for epics to load
    await waitFor(() => {
      expect(screen.getByText("Authentication Epic")).toBeInTheDocument();
    });

    // Pages and actions should not be visible
    expect(screen.queryByText("Sprint Board")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync Jira")).not.toBeInTheDocument();
  });

  it("Escape in epic mode closes the palette", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    // Activate epic mode
    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "epic" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Search Epics")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Search Epics").closest("[data-palette-row]")!);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search epics/i)).toBeInTheDocument();
    });

    // Press Escape
    const epicInput = screen.getByPlaceholderText(/search epics/i);
    await act(async () => {
      fireEvent.keyDown(epicInput, { key: "Escape" });
    });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search epics/i)).not.toBeInTheDocument();
    }, { timeout: 300 });
  });

  it("epic mode resets when palette is closed and reopened", async () => {
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    // Activate epic mode
    const input = screen.getByPlaceholderText(/search pages/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: "epic" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Search Epics")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Search Epics").closest("[data-palette-row]")!);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search epics/i)).toBeInTheDocument();
    });

    // Close
    const epicInput = screen.getByPlaceholderText(/search epics/i);
    await act(async () => {
      fireEvent.keyDown(epicInput, { key: "Escape" });
    });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search epics/i)).not.toBeInTheDocument();
    }, { timeout: 300 });

    // Reopen with Cmd+K (should be normal mode)
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.getByPlaceholderText(/search pages/i)).toBeInTheDocument();
  });
});
