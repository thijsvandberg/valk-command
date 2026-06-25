import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicChildrenSection } from "./EpicChildrenSection";
import type { EpicChild } from "@/types/ticket";

// BRDG-395: a story created via the inline quick-add gets an "Open in Story Writer" pill
// on its fresh row, and the marker survives a background refetch (onMutate). BoardRow is
// stubbed to surface the showStoryWriterLink flag; the assertions cover the marker flow,
// not the pill UI itself (that is in BoardRow.test.tsx).
vi.mock("@/components/sprint-board/BoardRow", () => ({
  BoardRow: ({ ticket, showStoryWriterLink }: { ticket: { key: string; title: string }; showStoryWriterLink?: boolean }) => (
    <tr data-testid={`child-row-${ticket.key}`}>
      <td>
        <span>{ticket.title}</span>
        {showStoryWriterLink && <span data-testid={`sw-link-${ticket.key}`}>Open in Story Writer</span>}
      </td>
    </tr>
  ),
}));

vi.mock("./EpicChildrenBySprint", () => ({ EpicChildrenBySprint: () => null }));

// Expose the inline create: a button that creates a Story via onCreate.
vi.mock("./ChildIssueComposer", () => ({
  ChildIssueComposer: ({ onCreate }: { onCreate: (title: string, jiraType: string) => void }) => (
    <button data-testid="composer-create" onClick={() => onCreate("Fresh story", "Story")} />
  ),
}));

// Expose the create-toggle so the composer (gated on createOpen) renders.
vi.mock("./ChildIssueListHeader", () => ({
  ChildIssueListHeader: ({ onToggleCreate }: { onToggleCreate?: () => void }) => (
    <button data-testid="toggle-create" onClick={() => onToggleCreate?.()} />
  ),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [], backlogCount: 0, mutate: vi.fn() }),
  useSprintSlots: () => ({ data: [] }),
  useTickets: () => ({ data: undefined, mutate: vi.fn() }),
}));

const mockCreateChildIssue = vi.fn();
vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(async () => []),
  apiFetch: vi.fn(),
  tickets: {
    createChildIssue: (...args: unknown[]) => mockCreateChildIssue(...args),
    updateMetadata: vi.fn(),
  },
  jira: {},
  refinementSessions: { listUrl: () => "/api/refinement-sessions", update: vi.fn().mockResolvedValue({}) },
  settings: {
    getSectionVisibility: vi.fn().mockResolvedValue(null),
    saveSectionVisibility: vi.fn().mockResolvedValue({}),
  },
  ApiError: class ApiError extends Error {},
}));

const CHILDREN: EpicChild[] = [
  { key: "VPL-10", title: "Existing story", type: "story", jiraStatus: "TO DO", assignee: null, flagged: false, storyPoints: 3, businessValue: 7, sprintName: null, subtaskCount: 0, readiness: null, jiraRank: null },
];

const CREATED = { key: "VPL-99", title: "Fresh story", type: "story", jiraStatus: "TO DO", assignee: null, flagged: false };

describe("EpicChildrenSection Story Writer marker (BRDG-395)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("flags the freshly-created row and keeps the flag across a refetch", async () => {
    mockCreateChildIssue.mockResolvedValueOnce(CREATED);
    const onMutate = vi.fn();
    const { rerender } = render(
      <EpicChildrenSection items={CHILDREN} ticketKey="VPL-1" onMutate={onMutate} />,
    );

    // Existing rows never carry the marker.
    expect(screen.queryByTestId("sw-link-VPL-10")).toBeNull();

    fireEvent.click(screen.getByTestId("toggle-create"));
    fireEvent.click(screen.getByTestId("composer-create"));

    // Once the create resolves, the new row shows the marker.
    await waitFor(() => expect(screen.getByTestId("sw-link-VPL-99")).toBeInTheDocument());
    await waitFor(() => expect(onMutate).toHaveBeenCalled());

    // Simulate the refetch landing the server copy of the child: the marker persists
    // because it lives in component state, not the list data.
    rerender(
      <EpicChildrenSection
        items={[...CHILDREN, { ...CREATED, storyPoints: null, businessValue: null, sprintName: null, subtaskCount: 0, readiness: "drafting", jiraRank: null } as EpicChild]}
        ticketKey="VPL-1"
        onMutate={onMutate}
      />,
    );
    expect(screen.getByTestId("sw-link-VPL-99")).toBeInTheDocument();
    // The pre-existing row is still unmarked.
    expect(screen.queryByTestId("sw-link-VPL-10")).toBeNull();
  });
});
