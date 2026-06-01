import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinkSuggestionChips, type LinkSuggestion } from "./LinkSuggestionChips";
import { tickets } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  tickets: { get: vi.fn(() => Promise.resolve(null)) },
}));

const mockGet = tickets.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue(null);
  window.localStorage.clear();
});

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

  it("shows 'Applied' in the header and auto-collapses when a key is already linked", () => {
    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set(["VPL-100"])}
        onLink={vi.fn()}
      />,
    );
    // Header badge visible, rows collapsed on reopen.
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.queryByText("VPL-100")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^link$/i })).toBeNull();
  });

  it("shows 'Linked' rows after expanding an auto-collapsed card", () => {
    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set(["VPL-100"])}
        onLink={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /link suggestions/i }));
    expect(screen.getAllByText("Linked")).toHaveLength(1);
    // VPL-200 should still have a Link button
    expect(screen.getAllByRole("button", { name: /^link$/i })).toHaveLength(1);
  });

  it("persists a manual collapse across remounts via messageId", () => {
    const { unmount } = render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set()}
        onLink={vi.fn()}
        messageId="lmsg-1"
      />,
    );
    expect(screen.getByText("VPL-100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /link suggestions/i }));
    expect(screen.queryByText("VPL-100")).not.toBeInTheDocument();

    unmount();
    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set()}
        onLink={vi.fn()}
        messageId="lmsg-1"
      />,
    );
    expect(screen.queryByText("VPL-100")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));
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

    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));

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

  it("drops a suggestion whose type resolves to epic", async () => {
    mockGet.mockImplementation((key: string) =>
      Promise.resolve((key === "VPL-200"
        ? { title: "An epic", type: "epic", jiraStatus: "TO DO", readiness: null }
        : { title: "A story", type: "story", jiraStatus: "TO DO", readiness: null }) as any),
    );

    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set()}
        onLink={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("VPL-200")).not.toBeInTheDocument();
    });
    expect(screen.getByText("VPL-100")).toBeInTheDocument();
    // The epic's relation group ("blocks") should disappear entirely.
    expect(screen.queryByText("blocks")).not.toBeInTheDocument();
    expect(screen.getByText("relates to")).toBeInTheDocument();
  });
});
