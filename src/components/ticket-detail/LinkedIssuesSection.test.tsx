import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinkedIssuesSection } from "./LinkedIssuesSection";
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
const mockRecentLinks = vi.fn();
vi.mock("@/lib/api-client", () => ({
  tickets: {
    searchForLink: (...args: unknown[]) => mockSearchForLink(...args),
    searchForLinkWithJira: (...args: unknown[]) => mockSearchForLinkWithJira(...args),
    createLink: (...args: unknown[]) => mockCreateLink(...args),
    deleteLink: (...args: unknown[]) => mockDeleteLink(...args),
    recentLinks: (...args: unknown[]) => mockRecentLinks(...args),
  },
}));

// Mock RelatedIssueSuggestions to avoid its dependencies
vi.mock("./RelatedIssueSuggestions", () => ({
  RelatedIssueSuggestionsPanel: () => null,
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

function renderSection(issues: LinkedIssue[] = []) {
  const onMutate = vi.fn();
  const result = render(
    <LinkedIssuesSection issues={issues} ticketKey="VPL-1" onMutate={onMutate} />,
  );
  return { ...result, onMutate };
}

describe("LinkedIssuesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecentLinks.mockResolvedValue([]);
    mockSearchForLinkWithJira.mockResolvedValue([]);
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
    mockSearchForLink.mockResolvedValue([
      { key: "VPL-200", title: "Search result issue", type: "task", status: "TO DO" },
    ]);

    renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "VPL" } });

    await waitFor(() => {
      expect(mockSearchForLink).toHaveBeenCalledWith("VPL", "VPL-1", expect.any(AbortSignal));
    });

    await waitFor(() => {
      expect(screen.getByText("VPL-200")).toBeInTheDocument();
      expect(screen.getByText("Search result issue")).toBeInTheDocument();
    });
  });

  it("creates link on result click", async () => {
    mockSearchForLink.mockResolvedValue([
      { key: "VPL-200", title: "Target issue", type: "task", status: "TO DO" },
    ]);
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
    });

    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("shows error when linking already-linked issue", async () => {
    mockSearchForLink.mockResolvedValue([
      { key: "VPL-100", title: "Existing linked issue", type: "story", status: "IN PROGRESS" },
    ]);

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
    expect(screen.getByText("VPL-100 is already linked")).toBeInTheDocument();
  });

  it("extracts issue key from Jira URL", async () => {
    mockSearchForLink.mockResolvedValue([]);

    renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, {
      target: { value: "https://test.atlassian.net/browse/VPL-999" },
    });

    await waitFor(() => {
      expect(mockSearchForLink).toHaveBeenCalledWith("VPL-999", "VPL-1", expect.any(AbortSignal));
    });
  });

  it("clears input on Escape", async () => {
    renderSection();
    const input = screen.getByPlaceholderText("Link issue...");
    fireEvent.change(input, { target: { value: "test" } });

    await waitFor(() => {
      expect(input).toHaveValue("test");
    });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });
});
