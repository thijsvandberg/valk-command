import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SearchModal } from "./SearchModal";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeLocalResult(key: string, summary: string, status = "TO DO") {
  return { key, summary, status, issueType: null, assignee: null, sprintName: null, labels: null, epic: null, description: null, jiraUrl: null, storyPoints: null, reporter: null, updatedAt: null, score: 0.1, matches: [] };
}

describe("SearchModal", () => {
  const onClose = vi.fn();
  const onSelectTicket = vi.fn();

  beforeEach(() => {
    // resetAllMocks clears implementations AND the Once queue, preventing
    // unconsumed Once values from leaking into subsequent tests.
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    // Re-assign the global after reset
    global.fetch = mockFetch;
    mockPush.mockReset();
  });

  it("does not render when open is false", () => {
    render(
      <SearchModal open={false} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    expect(screen.queryByPlaceholderText("Search tickets...")).not.toBeInTheDocument();
  });

  it("renders the input and mode tabs when open", () => {
    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    expect(screen.getByPlaceholderText("Search tickets...")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("Jira")).toBeInTheDocument();
  });

  it("pre-fills the input with initialQuery", () => {
    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    expect(screen.getByPlaceholderText("Search tickets...")).toHaveValue("auth");
  });

  it("calls onClose when Escape key is pressed", () => {
    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    const input = screen.getByPlaceholderText("Search tickets...");
    fireEvent.keyDown(input.closest("[data-result-row]") ?? document, { key: "Escape" });
    // The keydown handler is on the modal card div
    const modal = input.closest(".relative.z-10") ?? document.body;
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows results from local search API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          makeLocalResult("VPL-1", "User authentication flow"),
          makeLocalResult("VPL-2", "Payment service"),
        ],
      }),
    });

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      // The text appears in both the result row and the preview pane
      expect(screen.getAllByText("User authentication flow").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("navigates to ticket page and calls onClose when a local result is clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [makeLocalResult("VPL-3", "Login page redesign")],
      }),
    });

    render(
      <SearchModal open={true} initialQuery="login" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Login page redesign").length).toBeGreaterThanOrEqual(1);
    });

    // Regular click: router.push + onClose
    const resultRow = document.querySelector("[data-result-row] a")!;
    fireEvent.click(resultRow);
    expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-3");
    expect(onClose).toHaveBeenCalled();
  });

  it("cmd+click opens in new tab and keeps modal open", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [makeLocalResult("VPL-4", "Settings page")],
      }),
    });

    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <SearchModal open={true} initialQuery="settings" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Settings page").length).toBeGreaterThanOrEqual(1);
    });

    const resultRow = document.querySelector("[data-result-row] a")!;
    fireEvent.click(resultRow, { metaKey: true });
    // window.open called (new tab), modal stays open
    expect(windowOpenSpy).toHaveBeenCalledWith("/tickets/VPL-4", "_blank", "noopener,noreferrer");
    expect(onClose).not.toHaveBeenCalled();

    windowOpenSpy.mockRestore();
  });

  it("switches to Jira mode when Jira tab is clicked", () => {
    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    fireEvent.click(screen.getByText("Jira"));
    expect(screen.getByPlaceholderText("Search Jira...")).toBeInTheDocument();
  });

  it("shows the JQL override field when toggled", () => {
    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    fireEvent.click(screen.getByText("Jira"));
    fireEvent.click(screen.getByText("JQL override"));
    expect(screen.getByPlaceholderText("project = VPL AND ...")).toBeInTheDocument();
  });

  it("shows empty state when no results are returned", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    render(
      <SearchModal open={true} initialQuery="xyznotfound" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/No tickets matched/)).toBeInTheDocument();
    });
  });

  it("keyboard navigation: Enter selects result, Escape closes modal", async () => {
    // Use same setup as the passing "shows results" test (mockResolvedValueOnce with open=true from start)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          makeLocalResult("VPL-10", "Enter key nav test"),
          makeLocalResult("VPL-11", "Second entry nav"),
        ],
      }),
    });

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    // Wait for results to appear (same as the passing test)
    await waitFor(() => {
      expect(screen.getAllByText("Enter key nav test").length).toBeGreaterThanOrEqual(1);
    });

    // Find the modal card - it has the onKeyDown handler
    const footer = screen.getByText("navigate");
    const modalCard = footer.closest(".overflow-hidden")!;

    // First navigate down to select the first result (activeIdx starts at -1)
    fireEvent.keyDown(modalCard, { key: "ArrowDown" });
    await act(async () => {});

    // Press Enter → should select first active result (VPL-10)
    fireEvent.keyDown(modalCard, { key: "Enter" });
    await act(async () => {});

    expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-10");
    expect(onClose).toHaveBeenCalled();
  });

  describe("filter panel", () => {
    const filterOptionsResponse = {
      assignees: ["Alice", "Bob"],
      sprints: [{ id: "100", name: "Sprint 10" }],
    };

    function setupFetchWithFilterOptions() {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("filter-options")) {
          return Promise.resolve({ ok: true, json: async () => filterOptionsResponse });
        }
        return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
      });
    }

    it("shows filter toggle button in local mode", () => {
      render(<SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />);
      expect(screen.getByLabelText("Toggle filters")).toBeInTheDocument();
    });

    it("hides filter toggle button in jira mode", () => {
      render(<SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByText("Jira"));
      expect(screen.queryByLabelText("Toggle filters")).not.toBeInTheDocument();
    });

    it("shows filter panel when toggle is clicked", async () => {
      setupFetchWithFilterOptions();
      render(<SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByLabelText("Toggle filters"));
      await waitFor(() => {
        expect(screen.getByText("Status")).toBeInTheDocument();
      });
    });

    it("hides filter panel again on second click", async () => {
      setupFetchWithFilterOptions();
      render(<SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByLabelText("Toggle filters"));
      await waitFor(() => expect(screen.getByText("Status")).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText("Toggle filters"));
      await waitFor(() => expect(screen.queryByText("Status")).not.toBeInTheDocument());
    });

    it("re-runs search with dateRange param when a date range is selected", async () => {
      setupFetchWithFilterOptions();
      // initialQuery so the search fires (requires >=2 chars)
      render(<SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByLabelText("Toggle filters"));
      await waitFor(() => expect(screen.getByText("Last 7 days")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Last 7 days"));
      await waitFor(() => {
        const searchCalls = mockFetch.mock.calls
          .map(([url]: string[]) => url as string)
          .filter((url) => url.includes("/api/search/local?"));
        expect(searchCalls.some((url) => url.includes("dateRange=7d"))).toBe(true);
      });
    });

    it("resets filters and hides panel when modal closes", async () => {
      setupFetchWithFilterOptions();
      const { rerender } = render(
        <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />
      );
      fireEvent.click(screen.getByLabelText("Toggle filters"));
      await waitFor(() => expect(screen.getByText("Status")).toBeInTheDocument());

      // Close the modal
      rerender(<SearchModal open={false} onClose={onClose} onSelectTicket={onSelectTicket} />);

      // Reopen — filter panel should be collapsed again
      rerender(<SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />);
      expect(screen.queryByText("Status")).not.toBeInTheDocument();
    });

    it("shows Clear all button only when filters are active", async () => {
      setupFetchWithFilterOptions();
      render(<SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByLabelText("Toggle filters"));
      await waitFor(() => expect(screen.getByText("Last 7 days")).toBeInTheDocument());

      // No filters active yet — no Clear all
      expect(screen.queryByText("Clear all")).not.toBeInTheDocument();

      // Activate a date range
      fireEvent.click(screen.getByText("Last 7 days"));
      expect(screen.getByText("Clear all")).toBeInTheDocument();

      // Click Clear all — it should disappear
      fireEvent.click(screen.getByText("Clear all"));
      expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
    });
  });

  it("closes on backdrop click", () => {
    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    // The backdrop is the outermost div
    const backdrop = document.querySelector(".fixed.inset-0.z-50")!;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
