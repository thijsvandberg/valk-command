import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LinkSuggestionChips, type LinkSuggestion } from "./LinkSuggestionChips";

const SUGGESTIONS: LinkSuggestion[] = [
  { key: "VPL-100", relation: "relates to" },
  { key: "VPL-200", relation: "blocks" },
];

describe("LinkSuggestionChips", () => {
  it("renders a chip for each suggestion", () => {
    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set()}
        onLink={vi.fn()}
      />,
    );
    expect(screen.getByText("VPL-100")).toBeInTheDocument();
    expect(screen.getByText("VPL-200")).toBeInTheDocument();
    expect(screen.getByText("relates to")).toBeInTheDocument();
    expect(screen.getByText("blocks")).toBeInTheDocument();
  });

  it("shows 'Already linked' for keys in linkedIssueKeys", () => {
    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set(["VPL-100"])}
        onLink={vi.fn()}
      />,
    );
    expect(screen.getByText("Already linked")).toBeInTheDocument();
    // VPL-200 should still have a Link button
    const linkButtons = screen.getAllByRole("button", { name: /link/i });
    expect(linkButtons).toHaveLength(1);
  });

  it("calls onLink and shows 'Linked' on success", async () => {
    const onLink = vi.fn().mockResolvedValue(undefined);
    render(
      <LinkSuggestionChips
        suggestions={[{ key: "VPL-100", relation: "relates to" }]}
        linkedIssueKeys={new Set()}
        onLink={onLink}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /link/i }));
    expect(onLink).toHaveBeenCalledWith("VPL-100", "relates to");

    await waitFor(() => {
      expect(screen.getByText("Linked")).toBeInTheDocument();
    });
  });

  it("shows Retry on link failure", async () => {
    const onLink = vi.fn().mockRejectedValue(new Error("API error"));
    render(
      <LinkSuggestionChips
        suggestions={[{ key: "VPL-100", relation: "relates to" }]}
        linkedIssueKeys={new Set()}
        onLink={onLink}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /link/i }));

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("renders nothing when suggestions array is empty", () => {
    const { container } = render(
      <LinkSuggestionChips
        suggestions={[]}
        linkedIssueKeys={new Set()}
        onLink={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the header", () => {
    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set()}
        onLink={vi.fn()}
      />,
    );
    expect(screen.getByText("Link suggestions")).toBeInTheDocument();
  });
});
