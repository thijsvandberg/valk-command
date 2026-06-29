import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { InvestigationSuggestionCard } from "./InvestigationSuggestionCard";
import { JIRA_COMMENT_LIMIT } from "@/lib/jira-content-limits";

describe("InvestigationSuggestionCard (BRDG-435)", () => {
  it("renders the result in an editable textarea", () => {
    const result = "## Findings\n\nAll good";
    render(<InvestigationSuggestionCard result={result} onPostComment={vi.fn()} />);
    const textarea = screen.getByLabelText("Investigation result") as HTMLTextAreaElement;
    expect(textarea.value).toBe(result);
  });

  it("posts the edited text, not the original", async () => {
    const onPostComment = vi.fn().mockResolvedValue(undefined);
    render(<InvestigationSuggestionCard result="original" onPostComment={onPostComment} />);

    const textarea = screen.getByLabelText("Investigation result");
    fireEvent.change(textarea, { target: { value: "edited report" } });
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
    const textarea = screen.getByLabelText("Investigation result") as HTMLTextAreaElement;
    expect(textarea).not.toBeDisabled();
    expect(textarea.value).toBe("report");
  });

  it("blocks posting client-side when over the comment length limit", () => {
    const onPostComment = vi.fn();
    render(<InvestigationSuggestionCard result="short" onPostComment={onPostComment} />);

    const textarea = screen.getByLabelText("Investigation result");
    fireEvent.change(textarea, { target: { value: "x".repeat(JIRA_COMMENT_LIMIT + 1) } });

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
