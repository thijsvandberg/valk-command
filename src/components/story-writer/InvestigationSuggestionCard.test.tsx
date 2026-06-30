import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InvestigationSuggestionCard } from "./InvestigationSuggestionCard";
import { JIRA_COMMENT_LIMIT } from "@/lib/jira-content-limits";

// The card uses the same rich-text editor as the description. Stub it to a plain
// textarea so the editing flow is drivable, and render markdown as raw text so we
// can assert what the read view receives.
vi.mock("@/components/rich-editor/RichEditor", () => ({
  RichEditor: ({
    value,
    onChange,
    onSave,
    actions,
  }: {
    value: string;
    onChange?: (v: string) => void;
    onSave?: () => void;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="rich-editor">
      <textarea
        aria-label="Investigation result"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <button data-testid="editor-save" onClick={() => onSave?.()}>save</button>
      {actions}
    </div>
  ),
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (content: string) => <div data-testid="rendered-markdown">{content}</div>,
}));

describe("InvestigationSuggestionCard (BRDG-435)", () => {
  it("renders the result as rendered markdown, not raw in a textarea", () => {
    const result = "## Findings\n\nAll good";
    render(<InvestigationSuggestionCard result={result} onPostComment={vi.fn()} />);
    expect(screen.getByTestId("rendered-markdown")).toHaveTextContent("Findings");
    expect(screen.queryByLabelText("Investigation result")).toBeNull();
  });

  it("opens the rich-text editor when the rendered finding is clicked", () => {
    render(<InvestigationSuggestionCard result="report" onPostComment={vi.fn()} />);
    expect(screen.queryByTestId("rich-editor")).toBeNull();
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByTestId("rich-editor")).toBeInTheDocument();
  });

  it("posts the edited text, not the original", async () => {
    const onPostComment = vi.fn().mockResolvedValue(undefined);
    render(<InvestigationSuggestionCard result="original" onPostComment={onPostComment} />);

    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.change(screen.getByLabelText("Investigation result"), {
      target: { value: "edited report" },
    });
    fireEvent.click(screen.getByRole("button", { name: /post as comment/i }));

    expect(onPostComment).toHaveBeenCalledWith("edited report");
  });

  it("shows a posted state and removes the post button after a successful post", async () => {
    const onPostComment = vi.fn().mockResolvedValue(undefined);
    render(<InvestigationSuggestionCard result="report" onPostComment={onPostComment} />);

    fireEvent.click(screen.getByRole("button", { name: /post as comment/i }));

    await waitFor(() => {
      expect(screen.getByText("Comment posted to Jira")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /post as comment/i })).toBeNull();
    expect(screen.getByText("Applied")).toBeInTheDocument();
  });

  it("keeps the text editable and shows an error when the post fails", async () => {
    const onPostComment = vi.fn().mockRejectedValue(new Error("boom"));
    render(<InvestigationSuggestionCard result="report" onPostComment={onPostComment} />);

    fireEvent.click(screen.getByRole("button", { name: /post as comment/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to post comment to Jira")).toBeInTheDocument();
    });
    // The finding is still there and can be reopened in the editor to fix.
    expect(screen.getByTestId("rendered-markdown")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByLabelText("Investigation result")).toHaveValue("report");
  });

  it("blocks posting client-side when over the comment length limit", () => {
    const onPostComment = vi.fn();
    render(<InvestigationSuggestionCard result="short" onPostComment={onPostComment} />);

    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.change(screen.getByLabelText("Investigation result"), {
      target: { value: "x".repeat(JIRA_COMMENT_LIMIT + 1) },
    });

    const postButton = screen.getByRole("button", { name: /post as comment/i });
    expect(postButton).toBeDisabled();
    expect(screen.getByText(/too long for a jira comment/i)).toBeInTheDocument();

    fireEvent.click(postButton);
    expect(onPostComment).not.toHaveBeenCalled();
  });

  it("disables the post button for an empty body", () => {
    render(<InvestigationSuggestionCard result="   " onPostComment={vi.fn()} />);
    expect(screen.getByRole("button", { name: /post as comment/i })).toBeDisabled();
  });
});
