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
  BreakdownBoard: ({ onOpenChild, onLinkExisting }: { onOpenChild?: (k: string) => void; onLinkExisting?: () => void }) => (
    <div data-testid="board">
      <button onClick={() => onOpenChild?.("VPL-999")}>mock-open-child</button>
      <button onClick={() => onLinkExisting?.()}>mock-link-existing</button>
    </div>
  ),
}));
vi.mock("./LinkExistingStoryModal", () => ({
  LinkExistingStoryModal: ({ open, onLink }: { open: boolean; onLink: (k: string[]) => Promise<void> }) =>
    open ? (
      <div data-testid="link-existing-modal">
        <button onClick={() => onLink(["VPL-100"])}>mock-confirm-link</button>
      </div>
    ) : null,
}));
// The Draft view now embeds the editable RichEditor (BRDG-485); stub it so the
// switch renders the epic's draft body.
vi.mock("./StoryDraftEditor", () => ({
  StoryDraftEditor: ({ localDraft }: { localDraft: string }) => (
    <div data-testid="draft-editor">{localDraft}</div>
  ),
}));
// The in-place child writer runs its own useStoryWriter; stub it here.
vi.mock("./ChildStoryView", () => ({
  ChildStoryView: ({ childKey, onClose }: { childKey: string; onClose: () => void }) => (
    <div data-testid="child-view">
      {childKey}
      <button onClick={onClose}>close-child</button>
    </div>
  ),
}));
// The Sprints view (BRDG-486) reuses the epic single view's children section and
// self-fetches the epic's children; stub it so the layout test stays focused on
// the view switching and its own onSelectChild wiring.
vi.mock("./EpicSprintPlanning", () => ({
  EpicSprintPlanning: ({ epicKey, onSelectChild, onChildChanged }: { epicKey: string; onSelectChild?: (k: string) => void; onChildChanged?: () => void }) => (
    <div data-testid="sprint-planning">
      {epicKey}
      <button onClick={() => onSelectChild?.("VPL-555")}>mock-plan-open-child</button>
      <button onClick={() => onChildChanged?.()}>mock-plan-changed</button>
    </div>
  ),
}));
vi.mock("./PhaseRail", () => ({
  PhaseRail: ({ onSelect }: { onSelect: (p: string) => void }) => (
    <div data-testid="rail">
      <button onClick={() => onSelect("feed")}>phase-feed</button>
      <button onClick={() => onSelect("breakdown")}>phase-breakdown</button>
      <button onClick={() => onSelect("sprints")}>phase-sprints</button>
    </div>
  ),
}));
vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="issue-pill">{ticketKey}</span>
  ),
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
    linkExistingChildren: vi.fn().mockResolvedValue({ linked: ["VPL-100"], failed: [] }),
    generateBreakdown: vi.fn(),
    refreshSession: vi.fn().mockResolvedValue(undefined),
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

  it("shows the breakdown board by default and can switch to the editable draft", () => {
    setWriter({
      session: { localDraft: "Worked-out epic body", localTitle: "Room deposit" },
      cards: [],
    });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    // Breakdown board is the default right-region view.
    expect(screen.getByTestId("board")).toBeTruthy();

    // Switch to the Draft view via the Apps dropdown -> the editable draft editor
    // renders the saved epic draft (BRDG-485).
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Draft/ }));
    expect(screen.getByTestId("draft-editor")).toHaveTextContent("Worked-out epic body");
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
    expect(screen.getByTestId("draft-editor")).toHaveTextContent("Epic body");

    // Selecting the breakdown phase switches back to the board.
    fireEvent.click(screen.getByText("phase-breakdown"));
    expect(screen.getByTestId("board")).toBeTruthy();
  });

  it("opens a child story in-place and can close it (BRDG-485)", () => {
    setWriter({ session: { localDraft: "Epic body", localTitle: "Room deposit" }, cards: [] });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    // Opening a created card mounts the in-place child writer and lists it in Apps.
    fireEvent.click(screen.getByText("mock-open-child"));
    expect(screen.getByTestId("child-view")).toHaveTextContent("VPL-999");
    expect(screen.queryByTestId("board")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    expect(screen.getByRole("menuitem", { name: /VPL-999/ })).toBeTruthy();

    // Closing the child returns to the breakdown board.
    fireEvent.click(screen.getByText("close-child"));
    expect(screen.queryByTestId("child-view")).toBeNull();
    expect(screen.getByTestId("board")).toBeTruthy();
  });

  it("switches to the Sprints planning view and navigates back to Breakdown freely (BRDG-486)", () => {
    setWriter({ session: { localDraft: "Epic body", localTitle: "Room deposit" }, cards: [] });
    render(<EpicWriterLayout epicKey="VPL-47279" />);

    // Breakdown is the default; switch to Sprints via the Apps dropdown.
    expect(screen.getByTestId("board")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sprints/ }));
    expect(screen.getByTestId("sprint-planning")).toHaveTextContent("VPL-47279");
    expect(screen.queryByTestId("board")).toBeNull();

    // And straight back to Breakdown - the tab bar is freely navigable both ways.
    fireEvent.click(screen.getByRole("button", { name: /Apps/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Breakdown/ }));
    expect(screen.getByTestId("board")).toBeTruthy();
    expect(screen.queryByTestId("sprint-planning")).toBeNull();
  });

  it("focuses the Sprints view when the Sprints phase is selected (BRDG-486)", () => {
    setWriter({ session: { localDraft: "Epic body", localTitle: "Room deposit" }, cards: [] });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    fireEvent.click(screen.getByText("phase-sprints"));
    expect(screen.getByTestId("sprint-planning")).toBeTruthy();
    expect(screen.queryByTestId("board")).toBeNull();

    // The breakdown phase switches back to the board.
    fireEvent.click(screen.getByText("phase-breakdown"));
    expect(screen.getByTestId("board")).toBeTruthy();
    expect(screen.queryByTestId("sprint-planning")).toBeNull();
  });

  it("opens a created child in-place from the Sprints view (BRDG-486)", () => {
    setWriter({ session: { localDraft: "Epic body", localTitle: "Room deposit" }, cards: [] });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    fireEvent.click(screen.getByText("phase-sprints"));
    fireEvent.click(screen.getByText("mock-plan-open-child"));
    // Selecting a story in the Sprints view opens it as the in-place child writer.
    expect(screen.getByTestId("child-view")).toHaveTextContent("VPL-555");
    expect(screen.queryByTestId("sprint-planning")).toBeNull();
  });

  it("refreshes the writer session when a child is moved in the Sprints view (BRDG-486)", () => {
    setWriter({ session: { localDraft: "Epic body", localTitle: "Room deposit" }, cards: [] });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    fireEvent.click(screen.getByText("phase-sprints"));
    fireEvent.click(screen.getByText("mock-plan-changed"));
    // The breakdown board's cards come from the session, so a sprint move in the
    // Sprints view must refresh it to keep the sprint badges in step.
    expect(mockWriter.refreshSession).toHaveBeenCalled();
  });

  it("opens the link-existing picker and links the chosen stories (BRDG-487)", async () => {
    setWriter({ session: { localDraft: "Epic body", localTitle: "Room deposit" }, cards: [] });
    render(<EpicWriterLayout epicKey="VPL-1" />);

    expect(screen.queryByTestId("link-existing-modal")).toBeNull();
    fireEvent.click(screen.getByText("mock-link-existing"));
    expect(screen.getByTestId("link-existing-modal")).toBeTruthy();

    fireEvent.click(screen.getByText("mock-confirm-link"));
    await screen.findByText("Linked 1 story to the epic");
    expect(mockWriter.linkExistingChildren).toHaveBeenCalledWith(["VPL-100"]);
  });
});
