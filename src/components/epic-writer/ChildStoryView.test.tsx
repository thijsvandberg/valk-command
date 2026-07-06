import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChildStoryView } from "./ChildStoryView";

// ChildStoryView runs its own useStoryWriter for the child ticket; the heavy
// children (chat, editor, self-fetching pill) are stubbed so these tests focus
// on the child header (save/push feedback + close).
const mockChild: Record<string, unknown> = {};
vi.mock("@/hooks/useStoryWriter", () => ({
  useStoryWriter: () => mockChild,
}));
vi.mock("@/components/story-writer/StoryWriterChat", () => ({
  StoryWriterChat: () => <div data-testid="child-chat" />,
}));
vi.mock("./StoryDraftEditor", () => ({
  StoryDraftEditor: ({ localDraft }: { localDraft: string }) => (
    <div data-testid="child-editor">{localDraft}</div>
  ),
}));
vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="child-pill">{ticketKey}</span>
  ),
}));

function setChild(overrides: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    status: "ready",
    session: { localDraft: "Child body", localTitle: "Child title" },
    messages: [],
    aiDrafts: [],
    streamProgress: "",
    streamError: null,
    usage: null,
    lastResponseDurationMs: null,
    codebaseResearch: false,
    setCodbaseResearch: vi.fn(),
    model: "claude-sonnet-4-6",
    setModel: vi.fn(),
    draftSaveState: "idle",
    sendMessage: vi.fn(),
    retryMessage: vi.fn(),
    dismissFailedMessage: vi.fn(),
    cancelCurrentTask: vi.fn(),
    acceptDraft: vi.fn(),
    updateLocalDraft: vi.fn(),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    pushToJira: vi.fn().mockResolvedValue({ success: true, conflict: false, contentChanged: false }),
  };
  for (const k of Object.keys(mockChild)) delete mockChild[k];
  Object.assign(mockChild, base, overrides);
}

describe("ChildStoryView (BRDG-485)", () => {
  beforeEach(() => setChild({}));

  it("renders the child pill, editor and refine chat", () => {
    render(<ChildStoryView childKey="VPL-47292" onClose={() => {}} showToast={() => {}} />);
    expect(screen.getByTestId("child-pill")).toHaveTextContent("VPL-47292");
    expect(screen.getByTestId("child-editor")).toHaveTextContent("Child body");
    expect(screen.getByTestId("child-chat")).toBeTruthy();
  });

  it("saves the child draft and toasts the child key", async () => {
    const showToast = vi.fn();
    render(<ChildStoryView childKey="VPL-47292" onClose={() => {}} showToast={showToast} />);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Draft saved for VPL-47292"));
    expect(mockChild.saveDraft).toHaveBeenCalled();
  });

  it("pushes the child to Jira with feedback", async () => {
    const showToast = vi.fn();
    render(<ChildStoryView childKey="VPL-47292" onClose={() => {}} showToast={showToast} />);
    fireEvent.click(screen.getByText("Push"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Pushed VPL-47292 to Jira"));
    expect(mockChild.pushToJira).toHaveBeenCalled();
  });

  it("closes via the close button", () => {
    const onClose = vi.fn();
    render(<ChildStoryView childKey="VPL-47292" onClose={onClose} showToast={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Close child story" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not save when there is no content", async () => {
    setChild({ session: { localDraft: "", localTitle: "" } });
    const showToast = vi.fn();
    render(<ChildStoryView childKey="VPL-47292" onClose={() => {}} showToast={showToast} />);
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Nothing to save yet"));
    expect(mockChild.saveDraft).not.toHaveBeenCalled();
  });
});
