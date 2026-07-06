import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { EpicWriterLayout } from "./EpicWriterLayout";

// The layout is driven entirely by useStoryWriter; the heavy children and the
// self-fetching pill are stubbed so these tests focus on the header feedback
// (BRDG-478) and the shared issue pill.
const mockWriter: Record<string, unknown> = {};
vi.mock("@/hooks/useStoryWriter", () => ({
  useStoryWriter: () => mockWriter,
}));
vi.mock("@/components/story-writer/StoryWriterChat", () => ({
  StoryWriterChat: () => <div data-testid="chat" />,
}));
vi.mock("./BreakdownBoard", () => ({
  BreakdownBoard: () => <div data-testid="board" />,
}));
vi.mock("./PhaseRail", () => ({
  PhaseRail: ({ onSelect }: { onSelect: (p: string) => void }) => (
    <div data-testid="rail">
      <button onClick={() => onSelect("feed")}>phase-feed</button>
      <button onClick={() => onSelect("breakdown")}>phase-breakdown</button>
    </div>
  ),
}));
vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="issue-pill">{ticketKey}</span>
  ),
}));
// The Draft content view reuses the real StoryPreviewApp; stub only renderMarkdown
// so the reuse (WriterContext -> StoryPreviewApp) is exercised without pulling the
// full markdown pipeline.
vi.mock("@/components/ticket-detail/renderMarkdown", () => ({
  renderMarkdown: (content: string) => <span data-testid="markdown">{content}</span>,
}));
// ViewHeader returns null without its portal target + FocusMode provider in a
// bare test; passthrough so the header actions/children render.
vi.mock("@/components/shared/ViewHeader", () => ({
  ViewHeader: ({ children, actions }: { children?: ReactNode; actions?: ReactNode }) => (
    <header>{children}{actions}</header>
  ),
  ViewHeaderDivider: () => <span />,
}));

function setWriter(overrides: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    status: "ready",
    session: null,
    messages: [],
    aiDrafts: [],
    cards: [],
    streamProgress: "",
    streamError: null,
    usage: null,
    lastResponseDurationMs: null,
    codebaseResearch: false,
    setCodbaseResearch: vi.fn(),
    model: "claude-sonnet-4-6",
    setModel: vi.fn(),
    draftSaveState: "idle",
    outdated: false,
    targetOutdated: false,
    sendMessage: vi.fn(),
    retryMessage: vi.fn(),
    dismissFailedMessage: vi.fn(),
    cancelCurrentTask: vi.fn(),
    acceptDraft: vi.fn(),
    dismissDraft: vi.fn(),
    updateLocalDraft: vi.fn(),
    updateLocalTitle: vi.fn(),
    updateTargetLocalDraft: vi.fn(),
    updateTargetLocalTitle: vi.fn(),
    createLink: vi.fn(),
    linkCandidate: vi.fn(),
    setPhase: vi.fn(),
    deepenCard: vi.fn(),
    updateCardBody: vi.fn(),
    createCardInJira: vi.fn(),
    confirmCardLink: vi.fn(),
    reassignCardSprint: vi.fn(),
    generateBreakdown: vi.fn(),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    pushToJira: vi.fn().mockResolvedValue({ success: true, conflict: false, contentChanged: false }),
  };
  for (const k of Object.keys(mockWriter)) delete mockWriter[k];
  Object.assign(mockWriter, base, overrides);
}

describe("EpicWriterLayout header (BRDG-478)", () => {
  beforeEach(() => {
    setWriter({});
  });

  it("renders the epic key through the shared issue pill", () => {
    render(<EpicWriterLayout epicKey="VPL-47279" />);
    expect(screen.getByTestId("issue-pill")).toHaveTextContent("VPL-47279");
  });

  it("shows 'Nothing to save yet' when there is no draft content", async () => {
    setWriter({ session: { localDraft: "", localTitle: "" } });
    render(<EpicWriterLayout epicKey="VPL-1" />);
    fireEvent.click(screen.getByText("Save draft"));
    expect(await screen.findByText("Nothing to save yet")).toBeTruthy();
    expect(mockWriter.saveDraft).not.toHaveBeenCalled();
  });

  it("saves and confirms with a toast when there is content", async () => {
    setWriter({ session: { localDraft: "Some epic body", localTitle: "Epic" } });
    render(<EpicWriterLayout epicKey="VPL-1" />);
    fireEvent.click(screen.getByText("Save draft"));
    expect(await screen.findByText("Draft saved")).toBeTruthy();
    expect(mockWriter.saveDraft).toHaveBeenCalled();
  });

  it("shows a success toast after pushing to Jira", async () => {
    setWriter({ session: { localDraft: "Body", localTitle: "Epic" } });
    render(<EpicWriterLayout epicKey="VPL-1" />);
    fireEvent.click(screen.getByText("Push to Jira"));
    expect(await screen.findByText("Pushed to Jira")).toBeTruthy();
    expect(mockWriter.pushToJira).toHaveBeenCalled();
  });

  it("surfaces an external-update conflict on push", async () => {
    setWriter({
      session: { localDraft: "Body", localTitle: "Epic" },
      pushToJira: vi.fn().mockResolvedValue({ success: false, conflict: true, contentChanged: true }),
    });
    render(<EpicWriterLayout epicKey="VPL-1" />);
    fireEvent.click(screen.getByText("Push to Jira"));
    expect(await screen.findByText(/updated externally/i)).toBeTruthy();
  });

  it("shows 'Nothing to push' when there is no content to push", async () => {
    setWriter({ session: { localDraft: "", localTitle: "" } });
    render(<EpicWriterLayout epicKey="VPL-1" />);
    fireEvent.click(screen.getByText("Push to Jira"));
    expect(await screen.findByText("Nothing to push to Jira yet")).toBeTruthy();
    expect(mockWriter.pushToJira).not.toHaveBeenCalled();
  });

  it("reports a failed push", async () => {
    setWriter({
      session: { localDraft: "Body", localTitle: "Epic" },
      pushToJira: vi.fn().mockRejectedValue(new Error("boom")),
    });
    render(<EpicWriterLayout epicKey="VPL-1" />);
    fireEvent.click(screen.getByText("Push to Jira"));
    expect(await screen.findByText("Push to Jira failed")).toBeTruthy();
  });
});

describe("EpicWriterLayout content views (BRDG-484)", () => {
  beforeEach(() => {
    setWriter({});
  });

  it("shows the breakdown board by default and can switch to the saved draft", () => {
    setWriter({
      session: { localDraft: "Worked-out epic body", localTitle: "Room deposit" },
      cards: [],
    });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    // Breakdown board is the default right-region view.
    expect(screen.getByTestId("board")).toBeTruthy();

    // Switch to the Draft view via the Apps dropdown -> the real StoryPreviewApp
    // renders the saved epic draft (reusing the Story Writer pane app).
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Draft/ }));
    const markdownNodes = screen.getAllByTestId("markdown");
    expect(markdownNodes.some((n) => n.textContent === "Worked-out epic body")).toBe(true);
    // The board is unmounted while the draft view is active.
    expect(screen.queryByTestId("board")).toBeNull();
  });

  it("renders a resize separator between the panes", () => {
    render(<EpicWriterLayout epicKey="VPL-1" />);
    expect(screen.getByRole("separator", { name: "Resize panels" })).toBeTruthy();
  });

  it("focuses the right region on the artifact a selected phase is about", () => {
    setWriter({ session: { localDraft: "Epic body", localTitle: "Room deposit" }, cards: [] });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    // Selecting an early phase focuses the saved draft view.
    fireEvent.click(screen.getByText("phase-feed"));
    expect(screen.queryByTestId("board")).toBeNull();
    expect(screen.getAllByTestId("markdown").some((n) => n.textContent === "Epic body")).toBe(true);

    // Selecting the breakdown phase switches back to the board.
    fireEvent.click(screen.getByText("phase-breakdown"));
    expect(screen.getByTestId("board")).toBeTruthy();
  });
});
