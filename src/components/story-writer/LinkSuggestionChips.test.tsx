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

  it("drops a suggestion already linked beforehand, keeping the rest", () => {
    render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set(["VPL-100"])}
        onLink={vi.fn()}
      />,
    );
    // Already-linked story is dropped, along with its now-empty relation group.
    expect(screen.queryByText("VPL-100")).not.toBeInTheDocument();
    expect(screen.queryByText("relates to")).not.toBeInTheDocument();
    // The remaining fresh suggestion stays actionable.
    expect(screen.getByText("VPL-200")).toBeInTheDocument();
    expect(screen.getByText("blocks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^link$/i })).toBeInTheDocument();
    // Nothing is applied, so no header badge.
    expect(screen.queryByText("Applied")).not.toBeInTheDocument();
  });

  it("renders nothing when every suggestion is already linked", () => {
    const { container } = render(
      <LinkSuggestionChips
        suggestions={SUGGESTIONS}
        linkedIssueKeys={new Set(["VPL-100", "VPL-200"])}
        onLink={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("keeps an in-session linked suggestion visible even after it lands in linkedIssueKeys", async () => {
    const onLink = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <LinkSuggestionChips
        suggestions={[{ key: "VPL-100", relation: "relates to" }]}
        linkedIssueKeys={new Set()}
        onLink={onLink}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));
    await waitFor(() => expect(screen.getByText("Linked")).toBeInTheDocument());

    // Parent refetch now reports the link as persisted; the row must remain so
    // the user still sees the confirmation rather than it vanishing.
    rerender(
      <LinkSuggestionChips
        suggestions={[{ key: "VPL-100", relation: "relates to" }]}
        linkedIssueKeys={new Set(["VPL-100"])}
        onLink={onLink}
      />,
    );
    expect(screen.getByText("VPL-100")).toBeInTheDocument();
    expect(screen.getByText("Linked")).toBeInTheDocument();
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
