import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelatedStoriesPanel } from "./RelatedStoriesPanel";
import type { RelatedStoryCandidateRow } from "@/db/schema";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  tickets: { get: vi.fn() },
  jira: { syncTickets: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: ({ type }: { type: string }) => (
    <span data-testid="issue-type-icon">{type}</span>
  ),
}));

vi.mock("@/components/shared/StatusBadge", () => ({
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (text: string) => <span data-testid="rendered-markdown">{text}</span>,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

function makeCandidate(overrides: Partial<RelatedStoryCandidateRow> = {}): RelatedStoryCandidateRow {
  return {
    id: "c1",
    sessionId: "s1",
    jiraKey: "VPL-100",
    title: "Related Story Title",
    matchReason: "Shares common theme",
    score: 85,
    isLinked: false,
    status: "TO DO",
    issueType: "story",
    jiraUrl: "https://jira.example.com/browse/VPL-100",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDefaultProps(overrides = {}) {
  return {
    candidates: [] as RelatedStoryCandidateRow[],
    onLink: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    selectedKey: null,
    onSelectedKeyChange: vi.fn(),
    onFindRelated: undefined,
    onPrefillFindRelated: undefined,
    ...overrides,
  };
}

describe("RelatedStoriesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no candidates and no onFindRelated", () => {
    render(<RelatedStoriesPanel {...makeDefaultProps()} />);

    expect(screen.getByText("No related stories found yet.")).toBeInTheDocument();
    expect(screen.getByText("Use the Find Related quick action in the chat.")).toBeInTheDocument();
  });

  it("shows 'Find related stories' button when onFindRelated is provided and no candidates", () => {
    const onFindRelated = vi.fn();
    render(
      <RelatedStoriesPanel
        {...makeDefaultProps({ onFindRelated })}
      />
    );

    expect(screen.getByText("Find related stories")).toBeInTheDocument();
  });

  it("renders candidate cards", () => {
    const candidates = [
      makeCandidate({ id: "c1", jiraKey: "VPL-100", title: "First Candidate" }),
      makeCandidate({ id: "c2", jiraKey: "VPL-200", title: "Second Candidate" }),
    ];
    render(<RelatedStoriesPanel {...makeDefaultProps({ candidates })} />);

    expect(screen.getByText("First Candidate")).toBeInTheDocument();
    expect(screen.getByText("Second Candidate")).toBeInTheDocument();
    expect(screen.getByText("VPL-100")).toBeInTheDocument();
    expect(screen.getByText("VPL-200")).toBeInTheDocument();
  });

  it("shows match reason in candidate card", () => {
    const candidates = [makeCandidate({ matchReason: "Shares booking logic" })];
    render(<RelatedStoriesPanel {...makeDefaultProps({ candidates })} />);

    expect(screen.getByText("Shares booking logic")).toBeInTheDocument();
  });

  it("calls onSelectedKeyChange when a candidate card is clicked", () => {
    const onSelectedKeyChange = vi.fn();
    const candidates = [makeCandidate({ jiraKey: "VPL-100" })];
    render(
      <RelatedStoriesPanel
        {...makeDefaultProps({ candidates, onSelectedKeyChange })}
      />
    );

    fireEvent.click(screen.getByText("Related Story Title"));

    expect(onSelectedKeyChange).toHaveBeenCalledWith("VPL-100");
  });

  it("calls onLink when link button is clicked", async () => {
    const onLink = vi.fn().mockResolvedValue(undefined);
    const candidates = [makeCandidate({ id: "c1", isLinked: false })];
    render(<RelatedStoriesPanel {...makeDefaultProps({ candidates, onLink })} />);

    fireEvent.click(screen.getByText("Link"));

    await waitFor(() => {
      expect(onLink).toHaveBeenCalledWith("c1", true);
    });
  });

  it("shows 'Linked' button for already-linked candidates", () => {
    const candidates = [makeCandidate({ isLinked: true })];
    render(<RelatedStoriesPanel {...makeDefaultProps({ candidates })} />);

    expect(screen.getByText("Linked")).toBeInTheDocument();
  });

  it("renders TicketDetail when selectedKey is set", () => {
    // When selectedKey is set, it shows the TicketDetail view
    // TicketDetail fetches data from API — we just check it renders the Back button
    render(
      <RelatedStoriesPanel
        {...makeDefaultProps({ selectedKey: "VPL-100", candidates: [] })}
      />
    );

    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("VPL-100")).toBeInTheDocument();
  });

  it("calls onSelectedKeyChange(null) when Back is clicked in detail view", () => {
    const onSelectedKeyChange = vi.fn();
    render(
      <RelatedStoriesPanel
        {...makeDefaultProps({ selectedKey: "VPL-100", onSelectedKeyChange })}
      />
    );

    fireEvent.click(screen.getByText("Back"));

    expect(onSelectedKeyChange).toHaveBeenCalledWith(null);
  });

  it("shows 'Find more' button with candidates when onFindRelated is provided", () => {
    const onFindRelated = vi.fn();
    const candidates = [makeCandidate()];
    render(
      <RelatedStoriesPanel
        {...makeDefaultProps({ candidates, onFindRelated })}
      />
    );

    expect(screen.getByText("Find more")).toBeInTheDocument();
  });

  it("score badge renders with score value", () => {
    const candidates = [makeCandidate({ score: 92 })];
    render(<RelatedStoriesPanel {...makeDefaultProps({ candidates })} />);

    expect(screen.getByText("92")).toBeInTheDocument();
  });
});
