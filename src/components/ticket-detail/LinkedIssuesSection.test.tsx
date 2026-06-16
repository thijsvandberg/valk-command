import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinkedIssuesSection } from "./LinkedIssuesSection";
import { __resetSectionCollapseStore, setSectionCollapsed, SECTION_KEYS } from "@/lib/section-collapse-store";
import type { LinkedIssue } from "@/types/ticket";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock api-client
const mockSearchForLink = vi.fn();
const mockSearchForLinkWithJira = vi.fn();
const mockCreateLink = vi.fn();
const mockDeleteLink = vi.fn();
const mockRecentlyUpdated = vi.fn();
const mockGetRelatedSuggestions = vi.fn();
vi.mock("@/lib/api-client", () => ({
  tickets: {
    searchForLink: (...args: unknown[]) => mockSearchForLink(...args),
    searchForLinkWithJira: (...args: unknown[]) => mockSearchForLinkWithJira(...args),
    createLink: (...args: unknown[]) => mockCreateLink(...args),
    deleteLink: (...args: unknown[]) => mockDeleteLink(...args),
    recentlyUpdated: (...args: unknown[]) => mockRecentlyUpdated(...args),
    getRelatedSuggestions: (...args: unknown[]) => mockGetRelatedSuggestions(...args),
  },
  jira: {
    linkTypesUrl: () => "/api/jira/link-types",
  },
  swrFetcher: vi.fn(),
}));

// Mock useLinkTypes hook
vi.mock("@/hooks/useLinkTypes", () => ({
  useLinkTypes: () => ({
    linkTypes: [
      { value: "relates to", label: "Relates to", jiraTypeName: "Relates", direction: "outward" },
      { value: "blocks", label: "Blocks", jiraTypeName: "Blocks", direction: "outward" },
      { value: "is blocked by", label: "Is blocked by", jiraTypeName: "Blocks", direction: "inward" },
    ],
    error: undefined,
    isLoading: false,
  }),
}));

// Mock RelatedIssueSuggestions to avoid its dependencies
vi.mock("./RelatedIssueSuggestions", () => ({
  RelatedSuggestions: () => null,
  toRelatedSuggestion: (row: unknown) => row,
}));

// Mock useTaskStream
vi.mock("@/hooks/useTaskStream", () => ({
  useTaskStream: () => {},
}));

// Mock agent-errors
vi.mock("@/lib/agent-errors", () => ({
  friendlyStreamError: (msg: string) => msg,
  isRetryableStreamError: () => false,
}));

const SAMPLE_ISSUES: LinkedIssue[] = [
  {
    key: "VPL-100",
    title: "Existing linked issue",
    type: "story",
    jiraStatus: "IN PROGRESS",
    assignee: null,
    relation: "relates to",
    jiraLinkId: "link-1",
  },
];

// The header "+" and AI-suggest actions now live behind one "..." menu; opening the link composer
// on a non-empty section means opening that menu and clicking its "Link an issue" item.
function openLinkComposer() {
  fireEvent.click(screen.getByLabelText("Linked issues actions"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Link an issue" }));
}

// An empty section starts collapsed; clicking the heading expands it (and auto-reveals the composer).
function expandSection() {
  fireEvent.click(screen.getByRole("button", { name: /Linked Issues/i }));
}

function renderSection(issues: LinkedIssue[] = [], { openLink = true } = {}) {
  const onMutate = vi.fn();
  const result = render(
    <LinkedIssuesSection issues={issues} ticketKey="VPL-1" onMutate={onMutate} />,
  );
  // Empty sections are collapsed and auto-open the composer on expand; non-empty sections stay
  // expanded with the composer hidden until the "..." menu opens it.
  if (openLink) {
    if (issues.length === 0) expandSection();
    else openLinkComposer();
  }
  return { ...result, onMutate };
}

describe("LinkedIssuesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSectionCollapseStore();
    mockRecentlyUpdated.mockResolvedValue({ results: [], hasMore: false });
    mockSearchForLinkWithJira.mockResolvedValue({ results: [], hasMore: false });
    mockGetRelatedSuggestions.mockResolvedValue({ suggestions: [], cachedAt: null });
  });

  it("starts collapsed when empty and auto-reveals the composer on expand", () => {
    renderSection([], { openLink: false });
    // Collapsed: neither the composer nor the actions menu are shown.
    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
    expect(screen.queryByLabelText("Linked issues actions")).toBeNull();
    expandSection();
    expect(screen.getByPlaceholderText("Link issue...")).toBeInTheDocument();
  });

  it("stays collapsed when empty even if the section was previously expanded on another ticket", () => {
    // Expanding an empty section once persists "expanded" in the shared store. That choice must not
    // replay onto other ticketless sections and re-open the composer unprompted (BRDG regression).
    setSectionCollapsed(SECTION_KEYS.linkedIssues, false);
    renderSection([], { openLink: false });
    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
    expect(screen.queryByLabelText("Linked issues actions")).toBeNull();
  });

  it("does not auto-open the composer when links exist; the menu toggles it", () => {
    renderSection(SAMPLE_ISSUES, { openLink: false });
    // Section is expanded (it has content) but the composer stays hidden until requested.
    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
    openLinkComposer();
    expect(screen.getByPlaceholderText("Link issue...")).toBeInTheDocument();
    openLinkComposer();
    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
  });

  it("a group heading + opens the composer with that relation preset", () => {
    const blockingIssue: LinkedIssue = {
      key: "VPL-200",
      title: "Blocking issue",
      type: "story",
      jiraStatus: "TO DO",
      assignee: null,
      relation: "blocks",
      jiraLinkId: "link-2",
    };
    renderSection([blockingIssue], { openLink: false });
    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
    fireEvent.click(screen.getByLabelText('Add a "blocks" link'));
    expect(screen.getByPlaceholderText("Link issue...")).toBeInTheDocument();
    // The relation chip is preset to the group's relation.
    expect(screen.getByText("Blocks")).toBeInTheDocument();
  });

  it("renders inline input placeholder when no issues exist", () => {
    renderSection();
    expect(screen.getByPlaceholderText("Link issue...")).toBeInTheDocument();
  });

  it("renders inline input below existing issues", () => {
    renderSection(SAMPLE_ISSUES);
    expect(screen.getByText("VPL-100")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Link issue...")).toBeInTheDocument();
  });

  it("shows search results after typing", async () => {
    mockSearchForLink.mockResolvedValue({ results: [
      { key: "VPL-200", title: "Search result issue", type: "task", status: "TO DO" },
    ], hasMore: false });

    renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "VPL" } });

    await waitFor(() => {
      expect(mockSearchForLink).toHaveBeenCalledWith("VPL", "VPL-1", 0, expect.any(AbortSignal));
    });

    await waitFor(() => {
      expect(screen.getByText("VPL-200")).toBeInTheDocument();
      expect(screen.getByText("Search result issue")).toBeInTheDocument();
    });
  });

  it("creates link on result click", async () => {
    mockSearchForLink.mockResolvedValue({ results: [
      { key: "VPL-200", title: "Target issue", type: "task", status: "TO DO" },
    ], hasMore: false });
    mockCreateLink.mockResolvedValue({
      key: "VPL-200",
      title: "Target issue",
      type: "task",
      jiraStatus: "TO DO",
      assignee: null,
      relation: "relates to",
    });

    const { onMutate } = renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "VPL" } });

    await waitFor(() => {
      expect(screen.getByText("VPL-200")).toBeInTheDocument();
    });

    // Click the search result
    fireEvent.mouseDown(screen.getByText("Target issue"));

    expect(mockCreateLink).toHaveBeenCalledWith("VPL-1", {
      targetKey: "VPL-200",
      relation: "relates to",
      jiraTypeName: "Relates",
      direction: "outward",
    });

    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("shows error when linking already-linked issue", async () => {
    mockSearchForLink.mockResolvedValue({ results: [
      { key: "VPL-100", title: "Existing linked issue", type: "story", status: "IN PROGRESS" },
    ], hasMore: false });

    renderSection(SAMPLE_ISSUES);
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "VPL-100" } });

    await waitFor(() => {
      expect(mockSearchForLink).toHaveBeenCalled();
    });

    // The dropdown shows up in a separate container; find the result button in the dropdown
    await waitFor(() => {
      const buttons = screen.getAllByText("Existing linked issue");
      // First is the existing row, second is the dropdown result
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    // Click the dropdown result (last one)
    const resultButtons = screen.getAllByText("Existing linked issue");
    fireEvent.mouseDown(resultButtons[resultButtons.length - 1]);

    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(screen.getByText('VPL-100 is already linked as "relates to"')).toBeInTheDocument();
  });

  it("extracts issue key from Jira URL", async () => {
    mockSearchForLink.mockResolvedValue({ results: [], hasMore: false });

    renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, {
      target: { value: "https://test.atlassian.net/browse/VPL-999" },
    });

    await waitFor(() => {
      expect(mockSearchForLink).toHaveBeenCalledWith("VPL-999", "VPL-1", 0, expect.any(AbortSignal));
    });
  });

  it("shows relation type dropdown that defaults to 'Relates to'", () => {
    renderSection();
    expect(screen.getByText("Relates to")).toBeInTheDocument();
  });

  it("allows selecting a different relation type", async () => {
    renderSection();
    // Click the relation dropdown button
    fireEvent.click(screen.getByText("Relates to"));
    // Select "Blocks"
    fireEvent.mouseDown(screen.getByText("Blocks"));

    await waitFor(() => {
      expect(screen.getByText("Blocks")).toBeInTheDocument();
    });
  });

  it("uses selected relation when creating a link", async () => {
    mockSearchForLink.mockResolvedValue({ results: [
      { key: "VPL-300", title: "Target", type: "task", status: "TO DO" },
    ], hasMore: false });
    mockCreateLink.mockResolvedValue({
      key: "VPL-300",
      title: "Target",
      type: "task",
      jiraStatus: "TO DO",
      assignee: null,
      relation: "blocks",
    });

    const { onMutate } = renderSection();

    // Change relation to "Blocks"
    fireEvent.click(screen.getByText("Relates to"));
    fireEvent.mouseDown(screen.getByText("Blocks"));

    // Type and select search result
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "VPL-300" } });

    await waitFor(() => {
      expect(screen.getByText("Target")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText("Target"));

    expect(mockCreateLink).toHaveBeenCalledWith("VPL-1", {
      targetKey: "VPL-300",
      relation: "blocks",
      jiraTypeName: "Blocks",
      direction: "outward",
    });

    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("closes the composer on Escape", async () => {
    renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "test" } });

    await waitFor(() => {
      expect(input).toHaveValue("test");
    });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
  });

  it("closes the composer when clicking outside it", () => {
    renderSection();
    expect(screen.getByPlaceholderText("Link issue...")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
  });

  it("closes the composer via the X button", () => {
    renderSection();
    expect(screen.getByPlaceholderText("Link issue...")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByPlaceholderText("Link issue...")).toBeNull();
  });

  // The optimistic row must persist after the link is saved, even while the parent ticket refetch
  // is still in flight (which can take seconds) — otherwise the row vanishes and reappears late.
  it("keeps the linked row visible after the link is saved, before the refetch lands", async () => {
    mockSearchForLink.mockResolvedValue({ results: [
      { key: "VPL-200", title: "Target issue", type: "task", status: "TO DO" },
    ], hasMore: false });
    mockCreateLink.mockResolvedValue({
      key: "VPL-200",
      title: "Target issue",
      type: "task",
      jiraStatus: "TO DO",
      assignee: null,
      relation: "relates to",
    });

    const { onMutate } = renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "VPL" } });

    await waitFor(() => {
      expect(screen.getByText("VPL-200")).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText("Target issue"));

    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });

    // The parent has not pushed refreshed `issues` yet; the optimistic row stays put.
    expect(document.querySelector('[data-ticket-key="VPL-200"]')).toBeInTheDocument();
  });

  // BRDG-332: linked-issue rows open in the SidePanel like subtasks/epic children.
  describe("row selection (BRDG-332)", () => {
    it("calls onSelectTicket with the row key when a linked-issue row is clicked", () => {
      const onSelectTicket = vi.fn();
      render(<LinkedIssuesSection issues={SAMPLE_ISSUES} ticketKey="VPL-1" onMutate={vi.fn()} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByText("Existing linked issue"));
      expect(onSelectTicket).toHaveBeenCalledWith("VPL-100", expect.anything());
    });

    it("opens a new tab and does not select on Cmd/Ctrl-click", () => {
      const onSelectTicket = vi.fn();
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      render(<LinkedIssuesSection issues={SAMPLE_ISSUES} ticketKey="VPL-1" onMutate={vi.fn()} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByText("Existing linked issue"), { ctrlKey: true });
      expect(onSelectTicket).not.toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith("/tickets/VPL-100", "_blank");
      openSpy.mockRestore();
    });

    it("does not select the issue when the Delete action is clicked", async () => {
      mockDeleteLink.mockResolvedValue({});
      const onSelectTicket = vi.fn();
      render(<LinkedIssuesSection issues={SAMPLE_ISSUES} ticketKey="VPL-1" onMutate={vi.fn()} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByTitle("Remove link"));
      expect(onSelectTicket).not.toHaveBeenCalled();
      await waitFor(() => expect(mockDeleteLink).toHaveBeenCalled());
    });

    it("does not make pending rows clickable", () => {
      const onSelectTicket = vi.fn();
      const pending: LinkedIssue = { ...SAMPLE_ISSUES[0], key: "VPL-101", title: "Pending issue", jiraLinkId: "pending-123" };
      render(<LinkedIssuesSection issues={[pending]} ticketKey="VPL-1" onMutate={vi.fn()} onSelectTicket={onSelectTicket} />);
      fireEvent.click(screen.getByText("Pending issue"));
      expect(onSelectTicket).not.toHaveBeenCalled();
    });

    it("highlights the row matching activeKey", () => {
      render(<LinkedIssuesSection issues={SAMPLE_ISSUES} ticketKey="VPL-1" onMutate={vi.fn()} onSelectTicket={vi.fn()} activeKey="VPL-100" />);
      const row = screen.getByText("Existing linked issue").closest("div");
      expect(row?.className).toContain("brand-600");
    });
  });
});
