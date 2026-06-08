import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RelatedStoriesInline } from "./ChatMessageParts";
import type { RelatedStoryCandidateRow } from "@/db/schema";

vi.mock("@/lib/api-client", () => ({
  tickets: { get: vi.fn(() => Promise.resolve(null)) },
}));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => <span>{ticketKey}</span>,
}));

function makeCandidate(overrides: Partial<RelatedStoryCandidateRow> = {}): RelatedStoryCandidateRow {
  return {
    id: "c1",
    sessionId: "s1",
    ticketKey: "VPL-1",
    jiraKey: "VPL-100",
    score: 90,
    title: "A related story",
    issueType: "story",
    status: "DONE",
    jiraUrl: null,
    updatedDate: null,
    matchReason: null,
    isLinked: false,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

describe("RelatedStoriesInline", () => {
  it("shows the Applied header badge when a candidate is linked", () => {
    render(
      <RelatedStoriesInline
        candidates={[makeCandidate({ isLinked: true })]}
        onLink={vi.fn()}
      />,
    );
    expect(screen.getByText("Applied")).toBeInTheDocument();
  });

  it("does not show the Applied badge when nothing is linked", () => {
    render(
      <RelatedStoriesInline
        candidates={[makeCandidate({ isLinked: false })]}
        onLink={vi.fn()}
      />,
    );
    expect(screen.queryByText("Applied")).toBeNull();
  });

  it("renders the side-panel button alongside the badge when onOpenPanel is provided", () => {
    render(
      <RelatedStoriesInline
        candidates={[makeCandidate({ isLinked: true })]}
        onLink={vi.fn()}
        onOpenPanel={vi.fn()}
      />,
    );
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in side panel" })).toBeInTheDocument();
  });

  it("opens the panel without toggling the card collapse", () => {
    const onOpenPanel = vi.fn();
    render(
      <RelatedStoriesInline
        candidates={[makeCandidate()]}
        onLink={vi.fn()}
        onOpenPanel={onOpenPanel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in side panel" }));
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    // The row stays visible (card not collapsed by the click bubbling up).
    expect(screen.getByText("A related story")).toBeInTheDocument();
  });
});
