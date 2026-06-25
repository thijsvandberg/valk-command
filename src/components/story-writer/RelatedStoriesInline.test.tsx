import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RelatedStoriesInline } from "./ChatMessageParts";
import type { RelatedStoryCandidate } from "@/types/story-writer";

const { ticketsGet } = vi.hoisted(() => ({
  ticketsGet: vi.fn((..._args: unknown[]) => Promise.resolve(null as unknown)),
}));
vi.mock("@/lib/api-client", () => ({
  tickets: { get: ticketsGet },
}));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, hoverData }: { ticketKey: string; hoverData?: { sprintName?: string | null } }) => (
    <span>
      {ticketKey}
      {hoverData?.sprintName ? ` [${hoverData.sprintName}]` : ""}
    </span>
  ),
}));

function makeCandidate(overrides: Partial<RelatedStoryCandidate> = {}): RelatedStoryCandidate {
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

  it("surfaces the candidate's sprint name in the pill hover once ticket data resolves", async () => {
    ticketsGet.mockResolvedValueOnce({
      title: "T", storyPoints: null, businessValue: null, sprintId: "555",
      epicKey: null, epic: null, assignee: null, reporter: null,
      openSubtaskCount: 0, totalSubtaskCount: 0, flagged: false,
    });
    render(
      <RelatedStoriesInline
        candidates={[makeCandidate({ sprintName: "BT: 139" })]}
        onLink={vi.fn()}
      />,
    );
    expect(await screen.findByText("VPL-100 [BT: 139]")).toBeInTheDocument();
  });

  it("renders gracefully when no sprint name is present", async () => {
    ticketsGet.mockResolvedValueOnce({
      title: "T", storyPoints: null, businessValue: null, sprintId: null,
      epicKey: null, epic: null, assignee: null, reporter: null,
      openSubtaskCount: 0, totalSubtaskCount: 0, flagged: false,
    });
    render(
      <RelatedStoriesInline
        candidates={[makeCandidate({ sprintName: null })]}
        onLink={vi.fn()}
      />,
    );
    expect(await screen.findByText("VPL-100")).toBeInTheDocument();
    expect(screen.queryByText(/\[/)).toBeNull();
  });
});
