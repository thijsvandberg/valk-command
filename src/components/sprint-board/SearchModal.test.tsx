import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { SearchModal } from "./SearchModal";
import type { LocalSearchResult, ConversationSearchResult, CommentSearchResult } from "@/lib/local-search-engine";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// localStorage mock for useLocalStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

function makeLocalResult(key: string, summary: string, status = "TO DO"): LocalSearchResult {
  return { key, summary, status, poStatus: null, readiness: null, issueType: null, assignee: null, sprintId: null, sprintName: null, labels: null, epic: null, epicKey: null, description: null, acceptanceCriteria: null, jiraUrl: null, storyPoints: null, reporter: null, updatedAt: null, score: 0.1, matches: [] };
}

function makeConversationResult(id: string, title: string, type = "chat") {
  return { id, title, type, relatedTicket: null, createdAt: new Date().toISOString(), messageSnippet: null, score: 0.1 };
}

function makeCommentResult(id: string, ticketKey: string, content: string, source: "jira" | "po" = "jira") {
  return { id, ticketKey, author: "Alice", content, source, createdAt: new Date().toISOString(), score: 0.1 };
}

// Returns a grouped response (new format)
function makeGroupedResponse(
  tickets: LocalSearchResult[] = [],
  conversations: ConversationSearchResult[] = [],
  comments: CommentSearchResult[] = [],
) {
  return {
    ok: true,
    json: async () => ({
      groups: { tickets, conversations, comments },
      results: tickets,
    }),
  };
}

describe("SearchModal", () => {
  const onClose = vi.fn();
  const onSelectTicket = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue(makeGroupedResponse());
    global.fetch = mockFetch;
    mockPush.mockReset();
    localStorageMock.clear();
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

  it("shows ticket results from local search API", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-1", "User authentication flow"), makeLocalResult("VPL-2", "Payment service")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("User authentication flow").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders section headers for each non-empty category", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-1", "Auth flow")],
      [makeConversationResult("c-1", "Auth chat")],
      [makeCommentResult("cm-1", "VPL-1", "Auth comment")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      // Section filter chips and section headers both contain the label text
      expect(screen.getByLabelText("Toggle Tickets section")).toBeInTheDocument();
      expect(screen.getByLabelText("Toggle Conversations section")).toBeInTheDocument();
      expect(screen.getByLabelText("Toggle Comments section")).toBeInTheDocument();
    });
  });

  it("section headers show result counts", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-1", "Auth flow"), makeLocalResult("VPL-2", "Auth service")],
      [makeConversationResult("c-1", "Auth chat")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      // Count badge "2" appears in the section header
      const ticketsHeader = screen.getByLabelText("Toggle Tickets section");
      expect(ticketsHeader).toBeTruthy();
      expect(ticketsHeader.textContent).toContain("2");
    });
  });

  it("does not render section headers for empty categories", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-1", "Auth flow")],
      // No conversations or comments
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Toggle Tickets section")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Toggle Conversations section")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Toggle Comments section")).not.toBeInTheDocument();
  });

  it("collapses a section when its header is clicked", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-1", "Auth flow")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText("Auth flow")).toBeInTheDocument());

    // Click the Tickets section header to collapse
    fireEvent.click(screen.getByLabelText("Toggle Tickets section"));

    expect(screen.queryByText("Auth flow")).not.toBeInTheDocument();
  });

  it("expands a collapsed section when its header is clicked again", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-1", "Auth flow")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText("Auth flow")).toBeInTheDocument());

    const header = screen.getByLabelText("Toggle Tickets section");
    // Collapse
    fireEvent.click(header);
    expect(screen.queryByText("Auth flow")).not.toBeInTheDocument();
    // Expand again
    fireEvent.click(header);
    expect(screen.getByText("Auth flow")).toBeInTheDocument();
  });

  it("show more button appears when section has more than 10 results", async () => {
    const tickets = Array.from({ length: 13 }, (_, i) => makeLocalResult(`VPL-${i}`, `Auth ticket ${i}`));
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(tickets));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Show \d+ more/)).toBeInTheDocument();
    });
  });

  it("clicking show more reveals all results in the section", async () => {
    const tickets = Array.from({ length: 12 }, (_, i) => makeLocalResult(`VPL-${i}`, `Auth ticket ${i}`));
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(tickets));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText(/Show \d+ more/)).toBeInTheDocument());

    // Only first 10 visible initially
    expect(screen.queryByText("Auth ticket 10")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Show \d+ more/));

    // All 12 now visible
    await waitFor(() => {
      expect(screen.getByText("Auth ticket 10")).toBeInTheDocument();
      expect(screen.getByText("Auth ticket 11")).toBeInTheDocument();
    });
  });

  it("navigates to ticket page and calls onClose when a local result is clicked", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-3", "Login page redesign")],
    ));

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

  it("navigates to /chat/{id} when a conversation result is clicked", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [],
      [makeConversationResult("conv-123", "Auth investigation")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText("Auth investigation")).toBeInTheDocument());

    const resultRow = document.querySelector("[data-result-row] a")!;
    fireEvent.click(resultRow);
    expect(mockPush).toHaveBeenCalledWith("/chat/conv-123");
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates to /tickets/{ticketKey} when a comment result is clicked", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [],
      [],
      [makeCommentResult("cm-99", "VPL-55", "Auth logic needs review")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText("Auth logic needs review")).toBeInTheDocument());

    const resultRow = document.querySelector("[data-result-row] a")!;
    fireEvent.click(resultRow);
    expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-55");
    expect(onClose).toHaveBeenCalled();
  });

  it("cmd+click opens in new tab and keeps modal open", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-4", "Settings page")],
    ));

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
    mockFetch.mockResolvedValueOnce(makeGroupedResponse());

    render(
      <SearchModal open={true} initialQuery="xyznotfound" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/No results matched/)).toBeInTheDocument();
    });
  });

  it("keyboard navigation: Enter selects result, Escape closes modal", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-10", "Enter key nav test"), makeLocalResult("VPL-11", "Second entry nav")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Enter key nav test").length).toBeGreaterThanOrEqual(1);
    });

    const footer = screen.getByText("navigate");
    const modalCard = footer.closest(".overflow-hidden")!;

    // Navigate down to select the first result
    fireEvent.keyDown(modalCard, { key: "ArrowDown" });
    await act(async () => {});

    fireEvent.keyDown(modalCard, { key: "Enter" });
    await act(async () => {});

    expect(mockPush).toHaveBeenCalledWith("/tickets/VPL-10");
    expect(onClose).toHaveBeenCalled();
  });

  it("keyboard navigation moves through grouped rows across sections", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [makeLocalResult("VPL-1", "Ticket result")],
      [makeConversationResult("c-1", "Conversation result")],
    ));

    render(
      <SearchModal open={true} initialQuery="result" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Ticket result")).toBeInTheDocument();
      expect(screen.getByText("Conversation result")).toBeInTheDocument();
    });

    const footer = screen.getByText("navigate");
    const modalCard = footer.closest(".overflow-hidden")!;

    // Arrow down twice: first to ticket (idx 0), then to conversation (idx 1)
    fireEvent.keyDown(modalCard, { key: "ArrowDown" });
    await act(async () => {});
    fireEvent.keyDown(modalCard, { key: "ArrowDown" });
    await act(async () => {});

    // Press Enter — should navigate to conversation
    fireEvent.keyDown(modalCard, { key: "Enter" });
    await act(async () => {});

    expect(mockPush).toHaveBeenCalledWith("/chat/c-1");
  });

  it("preview pane only activates for ticket results, not conversations", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse(
      [],
      [makeConversationResult("c-1", "Auth chat")],
    ));

    render(
      <SearchModal open={true} initialQuery="auth" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText("Auth chat")).toBeInTheDocument());

    const footer = screen.getByText("navigate");
    const modalCard = footer.closest(".overflow-hidden")!;

    // Navigate to the conversation result
    fireEvent.keyDown(modalCard, { key: "ArrowDown" });
    await act(async () => {});

    // The right-arrow shortcut hint should NOT appear (preview only for tickets)
    expect(screen.queryByText("preview")).not.toBeInTheDocument();
  });

  describe("filter panel", () => {
    const filterOptionsResponse = {
      assignees: ["Alice", "Bob"],
      sprints: [{ id: "100", name: "Sprint 10" }],
      poStatuses: ["Ready", "In Review"],
    };

    function setupFetchWithFilterOptions() {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("filter-options")) {
          return Promise.resolve({ ok: true, json: async () => filterOptionsResponse });
        }
        return Promise.resolve(makeGroupedResponse());
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

  it("shows recent searches when query is empty and history exists", async () => {
    // Pre-populate history
    localStorageMock.setItem("search_history", JSON.stringify(["auth flow", "payment service"]));

    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Recent searches")).toBeInTheDocument();
      expect(screen.getByText("auth flow")).toBeInTheDocument();
      expect(screen.getByText("payment service")).toBeInTheDocument();
    });
  });

  it("clicking a history item populates the query", async () => {
    localStorageMock.setItem("search_history", JSON.stringify(["auth flow"]));

    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText("auth flow")).toBeInTheDocument());

    fireEvent.click(screen.getByText("auth flow"));

    expect(screen.getByPlaceholderText("Search tickets...")).toHaveValue("auth flow");
  });

  it("Clear button removes history", async () => {
    localStorageMock.setItem("search_history", JSON.stringify(["auth flow"]));

    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => expect(screen.getByText("auth flow")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Clear"));

    await waitFor(() => {
      expect(screen.queryByText("Recent searches")).not.toBeInTheDocument();
      expect(screen.queryByText("auth flow")).not.toBeInTheDocument();
    });
  });

  it("shows 'Search in Jira mode' button in empty state for local mode with no results", async () => {
    mockFetch.mockResolvedValueOnce(makeGroupedResponse([]));

    render(
      <SearchModal open={true} initialQuery="xyznotfound" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Search in Jira mode")).toBeInTheDocument();
    });
  });

  it("does not show 'Search in Jira mode' button when query is too short", async () => {
    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    // Short query — empty state should not have the Jira CTA
    expect(screen.queryByText("Search in Jira mode")).not.toBeInTheDocument();
  });

  it("shows match snippet when Fuse match is in description field", async () => {
    const descriptionMatch = [
      {
        key: "description",
        value: "The user can reset their password using the email link provided",
        indices: [[15, 19]] as [number, number][],
      },
    ];
    const resultWithDescriptionMatch = {
      ...makeLocalResult("VPL-55", "Unrelated title"),
      description: "The user can reset their password using the email link provided",
      matches: descriptionMatch,
    };
    mockFetch.mockResolvedValueOnce(makeGroupedResponse([resultWithDescriptionMatch]));

    render(
      <SearchModal open={true} initialQuery="reset" onClose={onClose} onSelectTicket={onSelectTicket} />,
    );

    await waitFor(() => {
      // The snippet label "Desc" should appear
      expect(screen.getByText("Desc")).toBeInTheDocument();
    });
  });

  it("closes on backdrop click", () => {
    render(
      <SearchModal open={true} onClose={onClose} onSelectTicket={onSelectTicket} />,
    );
    // The backdrop is the outermost div
    const backdrop = document.querySelector(".fixed.inset-0.z-modal")!;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
