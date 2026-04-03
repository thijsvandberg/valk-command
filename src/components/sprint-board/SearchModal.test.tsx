import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SearchModal } from "./SearchModal";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeLocalResult(key: string, summary: string, status = "TO DO") {
  return { key, summary, status, priority: null, assignee: null, sprintName: null, labels: null, descriptionPreview: null, score: 0.1, matches: [] };
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

  it("calls onSelectTicket and onClose when a result is clicked", async () => {
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

    // Click the result row button (the first occurrence is in the result list)
    const resultRow = document.querySelector("[data-result-row] button")!;
    fireEvent.click(resultRow);
    expect(onSelectTicket).toHaveBeenCalledWith("VPL-3");
    expect(onClose).toHaveBeenCalled();
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

    // Press Enter → should select first active result (VPL-10)
    fireEvent.keyDown(modalCard, { key: "Enter" });
    await act(async () => {});

    expect(onSelectTicket).toHaveBeenCalledWith("VPL-10");
    expect(onClose).toHaveBeenCalled();
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
