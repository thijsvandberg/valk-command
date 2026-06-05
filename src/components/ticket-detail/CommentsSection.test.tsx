import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommentsSection } from "./CommentsSection";
import type { JiraComment } from "@/types/ticket";

const mockGetComments = vi.fn();
const mockAddComment = vi.fn();
const mockDeleteComment = vi.fn();
const mockAddJiraComment = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    getComments: (...args: unknown[]) => mockGetComments(...args),
    addComment: (...args: unknown[]) => mockAddComment(...args),
    deleteComment: (...args: unknown[]) => mockDeleteComment(...args),
    addJiraComment: (...args: unknown[]) => mockAddJiraComment(...args),
  },
}));

// Capture the linkifyRefs option so call-site tests can assert the flag is
// threaded. The pill rendering itself is covered by renderMarkdown.test.tsx.
vi.mock("./renderMarkdown", () => ({
  renderMarkdown: (content: string, opts?: { linkifyRefs?: boolean }) => (
    <span data-testid="markdown" data-linkify={opts?.linkifyRefs ? "true" : "false"}>{content}</span>
  ),
}));

vi.mock("@/hooks/usePrismLanguages", () => ({
  usePrismLanguages: () => {},
}));

vi.mock("@/components/shared/SectionHeader", () => ({
  SectionHeader: ({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) => (
    <div data-testid={`section-header-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      {title}{count !== undefined ? ` (${count})` : ""}
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    variant,
    "aria-label": ariaLabel,
    icon,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    "aria-label"?: string;
    icon?: React.ReactNode;
  }) => (
    <button onClick={onClick} data-variant={variant} aria-label={ariaLabel}>
      {icon}
      {children}
    </button>
  ),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { firstName: "Test", lastName: "User", imageUrl: null } }),
}));

function makeJiraComment(overrides: Partial<JiraComment> = {}): JiraComment {
  return {
    id: "jc-1",
    authorName: "Jane Doe",
    authorAvatar: null,
    authorInitials: "JD",
    authorColor: "#336699",
    content: "A Jira comment",
    createdAt: "2024-01-01T10:00:00Z",
    ...overrides,
  };
}

function renderSection(jiraComments: JiraComment[] = []) {
  const onMutate = vi.fn();
  const result = render(
    <CommentsSection ticketKey="VPL-1" jiraComments={jiraComments} onMutate={onMutate} />,
  );
  return { ...result, onMutate };
}

describe("CommentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetComments.mockResolvedValue({ poComments: [] });
    mockAddComment.mockResolvedValue({
      id: "real-1",
      author: "Product Owner",
      content: "New comment",
      createdAt: new Date().toISOString(),
    });
    mockDeleteComment.mockResolvedValue({});
    mockAddJiraComment.mockResolvedValue({});
  });

  it("renders PO comments section header", async () => {
    renderSection();
    await waitFor(() => {
      expect(screen.getByTestId("section-header-po-comments")).toBeInTheDocument();
    });
  });

  it("renders Jira comments section header", () => {
    renderSection();
    expect(screen.getByTestId("section-header-jira-comments")).toBeInTheDocument();
  });

  it("loads and displays PO comments", async () => {
    mockGetComments.mockResolvedValue({
      poComments: [
        { id: "po-1", author: "Product Owner", content: "First PO comment", createdAt: "2024-01-01T00:00:00Z" },
      ],
    });
    renderSection();
    await waitFor(() => {
      expect(screen.getByText("First PO comment")).toBeInTheDocument();
    });
  });

  it("linkifies ticket references in PO comments", async () => {
    mockGetComments.mockResolvedValue({
      poComments: [
        { id: "po-1", author: "Product Owner", content: "Blocked by VPL-99", createdAt: "2024-01-01T00:00:00Z" },
      ],
    });
    renderSection();
    await waitFor(() => {
      expect(screen.getByText("Blocked by VPL-99")).toHaveAttribute("data-linkify", "true");
    });
  });

  it("linkifies ticket references in Jira comments", () => {
    renderSection([makeJiraComment({ content: "Depends on VPL-42" })]);
    expect(screen.getByText("Depends on VPL-42")).toHaveAttribute("data-linkify", "true");
  });

  it("shows 'No comments yet' when no PO comments exist", async () => {
    mockGetComments.mockResolvedValue({ poComments: [] });
    renderSection();
    await waitFor(() => {
      expect(screen.getByText("No comments yet")).toBeInTheDocument();
    });
  });

  it("shows comment input textarea", () => {
    renderSection();
    expect(screen.getByPlaceholderText("Add a PO comment...")).toBeInTheDocument();
  });

  it("adds a PO comment when 'Comment' button is clicked", async () => {
    renderSection();
    const textarea = screen.getByPlaceholderText("Add a PO comment...");
    fireEvent.change(textarea, { target: { value: "My new comment" } });

    await waitFor(() => {
      expect(screen.getByText("Comment")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Comment"));

    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalledWith("VPL-1", { content: "My new comment" });
    });
  });

  it("submits PO comment on Cmd+Enter", async () => {
    renderSection();
    const textarea = screen.getByPlaceholderText("Add a PO comment...");
    fireEvent.change(textarea, { target: { value: "Quick comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalledWith("VPL-1", { content: "Quick comment" });
    });
  });

  it("submits PO comment on Ctrl+Enter", async () => {
    renderSection();
    const textarea = screen.getByPlaceholderText("Add a PO comment...");
    fireEvent.change(textarea, { target: { value: "Ctrl comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalledWith("VPL-1", { content: "Ctrl comment" });
    });
  });

  it("does not submit empty PO comment", async () => {
    renderSection();
    const textarea = screen.getByPlaceholderText("Add a PO comment...");
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("shows optimistic comment immediately after submission", async () => {
    mockAddComment.mockImplementation(() => new Promise(() => {})); // never resolves
    renderSection();
    const textarea = screen.getByPlaceholderText("Add a PO comment...");
    fireEvent.change(textarea, { target: { value: "Optimistic comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("Optimistic comment")).toBeInTheDocument();
    });
  });

  it("clears textarea after submitting comment", async () => {
    renderSection();
    const textarea = screen.getByPlaceholderText("Add a PO comment...");
    fireEvent.change(textarea, { target: { value: "Comment text" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("deletes a PO comment when delete button is clicked", async () => {
    mockGetComments.mockResolvedValue({
      poComments: [
        { id: "po-1", author: "Product Owner", content: "Deletable comment", createdAt: "2024-01-01T00:00:00Z" },
      ],
    });
    renderSection();

    await waitFor(() => {
      expect(screen.getByText("Deletable comment")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete comment"));

    await waitFor(() => {
      expect(mockDeleteComment).toHaveBeenCalledWith("VPL-1", "po-1");
    });
  });

  it("renders Jira comments", () => {
    const comments = [
      makeJiraComment({ id: "jc-1", content: "Jira comment text" }),
    ];
    renderSection(comments);
    expect(screen.getByText("Jira comment text")).toBeInTheDocument();
  });

  it("renders Jira comment author name", () => {
    const comments = [makeJiraComment({ authorName: "John Smith" })];
    renderSection(comments);
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("shows 'No Jira comments' when none exist", () => {
    renderSection([]);
    expect(screen.getByText("No Jira comments")).toBeInTheDocument();
  });

  it("shows Jira comment input", () => {
    renderSection();
    expect(screen.getByPlaceholderText("Post a comment to Jira...")).toBeInTheDocument();
  });

  it("submits Jira comment on Cmd+Enter", async () => {
    const onMutate = vi.fn();
    render(<CommentsSection ticketKey="VPL-1" jiraComments={[]} onMutate={onMutate} />);

    const textarea = screen.getByPlaceholderText("Post a comment to Jira...");
    fireEvent.change(textarea, { target: { value: "Jira message" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(mockAddJiraComment).toHaveBeenCalledWith("VPL-1", { content: "Jira message" });
    });
  });

  it("calls onMutate after posting Jira comment", async () => {
    const onMutate = vi.fn();
    render(<CommentsSection ticketKey="VPL-1" jiraComments={[]} onMutate={onMutate} />);

    const textarea = screen.getByPlaceholderText("Post a comment to Jira...");
    fireEvent.change(textarea, { target: { value: "Comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("shows success confirmation after posting Jira comment", async () => {
    render(<CommentsSection ticketKey="VPL-1" jiraComments={[]} onMutate={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Post a comment to Jira...");
    fireEvent.change(textarea, { target: { value: "Comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("Comment posted to Jira")).toBeInTheDocument();
    });
  });

  it("shows error when Jira comment fails", async () => {
    mockAddJiraComment.mockRejectedValue(new Error("Network error"));
    render(<CommentsSection ticketKey="VPL-1" jiraComments={[]} onMutate={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Post a comment to Jira...");
    fireEvent.change(textarea, { target: { value: "Comment" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("Failed to post comment to Jira")).toBeInTheDocument();
    });
  });
});
