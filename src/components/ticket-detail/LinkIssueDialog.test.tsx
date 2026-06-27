import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinkIssueDialog } from "./LinkIssueDialog";

const mockCreateLink = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    createLink: (...args: unknown[]) => mockCreateLink(...args),
    recentlyUpdated: vi.fn().mockResolvedValue({ results: [], hasMore: false }),
  },
  LinkSearchResult: {},
}));

let mockDefaultTeam: string | null = null;
vi.mock("@/hooks/useDefaultTeam", () => ({
  useDefaultTeam: () => ({ defaultTeam: mockDefaultTeam, setDefaultTeam: vi.fn(), isLoading: false }),
}));

vi.mock("@/hooks/useLinkTypes", () => ({
  useLinkTypes: () => ({
    linkTypes: [
      { value: "relates to", label: "Relates to", jiraTypeName: "Relates", direction: "outward" },
      { value: "blocks", label: "Blocks", jiraTypeName: "Blocks", direction: "outward" },
      { value: "is blocked by", label: "Is blocked by", jiraTypeName: "Blocks", direction: "inward" },
    ],
  }),
}));

const mockSearch = {
  query: "",
  setQuery: vi.fn(),
  showResults: false,
  setShowResults: vi.fn(),
  filteredResults: [],
  recentResults: [],
  isSearching: false,
  isSearchingJira: false,
  isLoadingMore: false,
  hasMore: false,
  highlightIndex: -1,
  setHighlightIndex: vi.fn(),
  availableStatuses: [],
  activeStatuses: [],
  toggleStatus: vi.fn(),
  clearStatusFilter: vi.fn(),
  loadMore: vi.fn(),
  resetSearch: vi.fn(),
  filters: { types: [], sprints: [], epics: [], assignees: [], projects: [], updatedWithin: null, preset: null },
  facets: { types: [], projects: [], assignees: [] },
  filtersActive: false,
  setFilter: vi.fn(),
  applyPreset: vi.fn(),
  clearFilters: vi.fn(),
};

vi.mock("@/hooks/useLinkIssueSearch", () => ({
  useLinkIssueSearch: () => mockSearch,
}));

// The filter bar has its own test; stub it here so this suite stays focused on
// the dialog (and so it doesn't pull in SWR without a provider).
vi.mock("./LinkIssueFilterBar", () => ({
  LinkIssueFilterBar: () => <div data-testid="link-issue-filter-bar" />,
}));

vi.mock("@/components/shared/Modal", () => ({
  Modal: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="modal">{children}</div> : null,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("./LinkSearchResultRow", () => ({
  LinkSearchResultRow: ({
    result,
    onSelect,
  }: {
    result: { key: string; title: string };
    highlighted: boolean;
    onSelect: (r: unknown) => void;
    onHover: () => void;
  }) => (
    <button data-testid={`result-${result.key}`} onClick={() => onSelect(result)}>
      {result.key} {result.title}
    </button>
  ),
}));

vi.mock("./StatusFilterChips", () => ({
  StatusFilterChips: () => <div data-testid="status-filter-chips" />,
}));

vi.mock("./ScrollSentinel", () => ({
  ScrollSentinel: () => <div data-testid="scroll-sentinel" />,
}));

vi.mock("@/hooks/useOutsideClick", () => ({
  useOutsideClick: () => {},
}));

function renderDialog(overrides: Partial<React.ComponentProps<typeof LinkIssueDialog>> = {}) {
  const onClose = vi.fn();
  const onLinked = vi.fn();

  const result = render(
    <LinkIssueDialog
      open={overrides.open ?? true}
      onClose={overrides.onClose ?? onClose}
      ticketKey={overrides.ticketKey ?? "VPL-1"}
      onLinked={overrides.onLinked ?? onLinked}
      defaultTargetKey={overrides.defaultTargetKey}
      defaultRelation={overrides.defaultRelation}
      initialQuery={overrides.initialQuery}
    />,
  );

  return { ...result, onClose, onLinked };
}

describe("LinkIssueDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultTeam = null;
    mockSearch.query = "";
    mockSearch.filteredResults = [];
    mockSearch.recentResults = [];
    mockSearch.showResults = false;
    mockSearch.isSearching = false;
  });

  it("renders nothing when not open", () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
  });

  it("renders modal when open", () => {
    renderDialog();
    expect(screen.getByTestId("modal")).toBeInTheDocument();
  });

  it("renders 'Link issue' heading", () => {
    renderDialog();
    expect(screen.getByText("Link issue")).toBeInTheDocument();
  });

  it("shows the ticket key in description text", () => {
    renderDialog({ ticketKey: "VPL-42" });
    expect(screen.getByText(/VPL-42/)).toBeInTheDocument();
  });

  it("renders relation type dropdown defaulting to 'Relates to'", () => {
    renderDialog();
    expect(screen.getByText("Relates to")).toBeInTheDocument();
  });

  it("renders with defaultRelation when provided", () => {
    renderDialog({ defaultRelation: "blocks" });
    expect(screen.getByText("Blocks")).toBeInTheDocument();
  });

  it("renders search input", () => {
    renderDialog();
    expect(screen.getByPlaceholderText("Search by key or title...")).toBeInTheDocument();
  });

  it("renders Cancel and Link buttons", () => {
    renderDialog();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Link")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Link button is disabled when no query or selection", () => {
    renderDialog();
    const linkBtn = screen.getByText("Link");
    expect(linkBtn).toBeDisabled();
  });

  it("opens relation type dropdown when clicked", () => {
    renderDialog();
    fireEvent.click(screen.getByText("Relates to"));
    expect(screen.getByPlaceholderText("Filter...")).toBeInTheDocument();
  });

  it("shows all relation types in dropdown", () => {
    renderDialog();
    fireEvent.click(screen.getByText("Relates to"));
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Is blocked by")).toBeInTheDocument();
  });

  it("selects a relation type from dropdown", async () => {
    renderDialog();
    fireEvent.click(screen.getByText("Relates to"));

    // Click "Blocks" option in the dropdown list
    const blocksOptions = screen.getAllByText("Blocks");
    fireEvent.click(blocksOptions[blocksOptions.length - 1]);

    await waitFor(() => {
      // The dropdown should close and "Blocks" should be the selected value
      expect(screen.queryByPlaceholderText("Filter...")).not.toBeInTheDocument();
    });
  });

  it("shows search results when available", () => {
    mockSearch.showResults = true;
    mockSearch.filteredResults = [
      { key: "VPL-200", title: "Found issue", type: "story", status: "TO DO" } as never,
    ];
    renderDialog();
    expect(screen.getByTestId("result-VPL-200")).toBeInTheDocument();
  });

  it("creates link when submit is called with a query", async () => {
    mockSearch.query = "VPL-200";
    const { onLinked } = renderDialog();
    mockCreateLink.mockResolvedValue({});

    fireEvent.keyDown(screen.getByPlaceholderText("Search by key or title..."), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(mockCreateLink).toHaveBeenCalledWith("VPL-1", expect.objectContaining({
        targetKey: "VPL-200",
        relation: "relates to",
      }));
    });

    await waitFor(() => {
      expect(onLinked).toHaveBeenCalled();
    });
  });

  it("shows submit error message on failure", async () => {
    mockSearch.query = "VPL-200";
    mockCreateLink.mockRejectedValue(new Error("Link failed"));
    renderDialog();

    fireEvent.keyDown(screen.getByPlaceholderText("Search by key or title..."), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to create link. Check that the issue key is valid.")).toBeInTheDocument();
    });
  });

  it("extracts key from Atlassian browse URL", async () => {
    mockSearch.query = "https://example.atlassian.net/browse/VPL-999";
    mockCreateLink.mockResolvedValue({});
    renderDialog();

    fireEvent.keyDown(screen.getByPlaceholderText("Search by key or title..."), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(mockCreateLink).toHaveBeenCalledWith("VPL-1", expect.objectContaining({
        targetKey: "VPL-999",
      }));
    });
  });

  it("shows recently updated issues when query is short", () => {
    mockSearch.recentResults = [
      { key: "VPL-50", title: "Recent issue" } as never,
    ];
    mockSearch.query = "";
    renderDialog();
    expect(screen.getByTestId("result-VPL-50")).toBeInTheDocument();
    expect(screen.getByText("Recently updated")).toBeInTheDocument();
  });

  it("shows 'No issues found' when query has no results", () => {
    mockSearch.query = "XYZ-999";
    mockSearch.showResults = true;
    mockSearch.filteredResults = [];
    mockSearch.isSearching = false;
    renderDialog();
    expect(screen.getByText(/No issues found for/)).toBeInTheDocument();
  });

  describe("default team (BRDG-396)", () => {
    it("defaults the team filter to the PO's own team when browsing from scratch", () => {
      mockDefaultTeam = "BT";
      renderDialog();
      expect(mockSearch.setFilter).toHaveBeenCalledWith("teams", ["BT"]);
    });

    it("does not apply the team default when opened with a carried-over query", () => {
      mockDefaultTeam = "BT";
      renderDialog({ initialQuery: "VPL-999" });
      expect(mockSearch.setFilter).not.toHaveBeenCalledWith("teams", ["BT"]);
    });

    it("does not apply a team default when no own-team is set", () => {
      mockDefaultTeam = null;
      renderDialog();
      expect(mockSearch.setFilter).not.toHaveBeenCalled();
    });
  });

  // An undefined token (var(--color-surface-default)) renders transparent; these
  // inset fields must carry a defined surface token against the elevated modal.
  describe("field backgrounds (BRDG-418)", () => {
    it("gives the search input a defined surface background, not a transparent fallback", () => {
      renderDialog();
      const input = screen.getByPlaceholderText("Search by key or title...");
      expect(input.className).toContain("bg-surface-base");
      expect(input.className).not.toContain("surface-default");
    });

    it("gives the relation filter input a defined surface background", () => {
      renderDialog();
      fireEvent.click(screen.getByText("Relates to"));
      const input = screen.getByPlaceholderText("Filter...");
      expect(input.className).toContain("bg-surface-base");
      expect(input.className).not.toContain("surface-default");
    });
  });
});
