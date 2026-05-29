import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaneProvider, usePaneContext, type PaneContextValue } from "./PaneContext";

function TestConsumer({ onValue }: { onValue: (v: PaneContextValue) => void }) {
  const ctx = usePaneContext();
  onValue(ctx);
  return null;
}

function renderProvider(
  onValue: (v: PaneContextValue) => void,
  opts: { ticketKey?: string; initialEditorOpen?: boolean } = {},
) {
  const { ticketKey = "VPL-1", initialEditorOpen } = opts;
  return render(
    <PaneProvider ticketKey={ticketKey} initialEditorOpen={initialEditorOpen}>
      <TestConsumer onValue={onValue} />
    </PaneProvider>,
  );
}

const store: Record<string, string> = {};
const mockStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};

Object.defineProperty(window, "localStorage", { value: mockStorage, writable: true });

describe("PaneContext", () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it("throws when usePaneContext is used outside PaneProvider", () => {
    expect(() => {
      render(<TestConsumer onValue={() => {}} />);
    }).toThrow("usePaneContext must be used inside PaneProvider");
  });

  it("provides default state with editor open", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: true });

    expect(ctx.paneVisible[0]).toBe(true);
    expect(ctx.paneVisible[1]).toBe(true);
    expect(ctx.paneApps[0]).toBe("chat");
    expect(ctx.paneApps[1]).toBe("editor");
    expect(ctx.paneCount).toBe(2);
  });

  it("provides default state with editor closed", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: false });

    expect(ctx.paneVisible[0]).toBe(true);
    expect(ctx.paneVisible[1]).toBe(false);
    expect(ctx.paneApps[0]).toBe("chat");
    expect(ctx.paneCount).toBe(1);
  });

  it("initializes from localStorage when stored data exists", () => {
    store["sw:VPL-99:panes"] = JSON.stringify({
      paneVisible: [true, false, true],
      paneApps: ["chat", null, "diff"],
      paneWidths: [50, 0, 50],
    });

    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { ticketKey: "VPL-99" });

    expect(ctx.paneVisible[0]).toBe(true);
    expect(ctx.paneVisible[1]).toBe(false);
    expect(ctx.paneVisible[2]).toBe(true);
    expect(ctx.paneApps[2]).toBe("diff");
  });

  it("persists state to localStorage on changes", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { ticketKey: "VPL-SAVE" });

    act(() => { ctx.showPane(2); });

    expect(mockStorage.setItem).toHaveBeenCalled();
    const paneCalls = mockStorage.setItem.mock.calls.filter(([k]: string[]) => k.includes("panes"));
    expect(paneCalls.length).toBeGreaterThan(0);
  });

  it("showPane makes a hidden pane visible", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: false });
    expect(ctx.paneVisible[1]).toBe(false);

    act(() => { ctx.showPane(1); });

    expect(ctx.paneVisible[1]).toBe(true);
  });

  it("hidePane hides a visible pane", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: true });
    expect(ctx.paneVisible[1]).toBe(true);

    act(() => { ctx.hidePane(1); });

    expect(ctx.paneVisible[1]).toBe(false);
  });

  it("never hides the last visible pane", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: false });
    expect(ctx.paneCount).toBe(1);

    act(() => { ctx.hidePane(0); });

    // Should remain visible — cannot hide the last pane
    expect(ctx.paneVisible[0]).toBe(true);
    expect(ctx.paneCount).toBe(1);
  });

  it("openApp places the app in the correct default pane and makes pane visible", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: false });

    act(() => { ctx.openApp("diff"); });

    // "diff" has default pane index 2
    expect(ctx.paneApps[2]).toBe("diff");
    expect(ctx.paneVisible[2]).toBe(true);
  });

  it("moveApp moves app to target pane and hides source pane", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: true });
    // Initially: pane 0 = chat, pane 1 = editor

    act(() => { ctx.moveApp("chat", 2); });

    expect(ctx.paneApps[2]).toBe("chat");
    // Source pane (0) should be hidden since it's now empty
    expect(ctx.paneVisible[0]).toBe(false);
  });

  it("openDraftPreview sets draftPreviewContent and opens pane 2", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: true });

    act(() => { ctx.openDraftPreview("Some content", "AI Draft 1", "draft-id-1"); });

    expect(ctx.draftPreviewContent?.content).toBe("Some content");
    expect(ctx.draftPreviewContent?.label).toBe("AI Draft 1");
    expect(ctx.draftPreviewContent?.draftId).toBe("draft-id-1");
    expect(ctx.paneApps[2]).toBe("draft-preview");
    expect(ctx.paneVisible[2]).toBe(true);
  });

  it("focusDraftPreview sets full-width layout in pane 0", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: true });

    act(() => { ctx.focusDraftPreview("Focus content", "Focus label"); });

    expect(ctx.draftPreviewContent?.content).toBe("Focus content");
    expect(ctx.paneApps[0]).toBe("draft-preview");
    expect(ctx.paneApps[1]).toBeNull();
    expect(ctx.paneApps[2]).toBeNull();
    expect(ctx.paneVisible[0]).toBe(true);
    expect(ctx.paneVisible[1]).toBe(false);
    expect(ctx.paneVisible[2]).toBe(false);
  });

  it("prefillChat sets pendingChatInput and opens chat app", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { initialEditorOpen: true });

    act(() => { ctx.prefillChat("Hello there"); });

    expect(ctx.pendingChatInput).toBe("Hello there");
    expect(ctx.paneApps[0]).toBe("chat");
  });

  it("consumePendingChatInput returns and clears the pending input", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; });

    act(() => { ctx.prefillChat("pending text"); });
    expect(ctx.pendingChatInput).toBe("pending text");

    let consumed: string | null = null;
    act(() => { consumed = ctx.consumePendingChatInput(); });

    expect(consumed).toBe("pending text");
    expect(ctx.pendingChatInput).toBeNull();
  });

  it("openDiffForDraft sets pendingDiffDraftId and opens diff app", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; });

    act(() => { ctx.openDiffForDraft("draft-abc"); });

    expect(ctx.pendingDiffDraftId).toBe("draft-abc");
    expect(ctx.paneApps[2]).toBe("diff");
  });

  it("consumePendingDiffDraftId returns and clears the pending draft id", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; });

    act(() => { ctx.openDiffForDraft("draft-xyz"); });
    let consumed: string | null = null;
    act(() => { consumed = ctx.consumePendingDiffDraftId(); });

    expect(consumed).toBe("draft-xyz");
    expect(ctx.pendingDiffDraftId).toBeNull();
  });

  it("registerToolbar and unregisterToolbar manage toolbar slots", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; });

    act(() => { ctx.registerToolbar("chat", { label: "Chat" }); });
    expect(ctx.toolbars["chat"]?.label).toBe("Chat");

    act(() => { ctx.unregisterToolbar("chat"); });
    expect(ctx.toolbars["chat"]).toBeUndefined();
  });

  it("setDraggedApp updates draggedApp state", () => {
    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; });

    act(() => { ctx.setDraggedApp("editor"); });
    expect(ctx.draggedApp).toBe("editor");

    act(() => { ctx.setDraggedApp(null); });
    expect(ctx.draggedApp).toBeNull();
  });

  it("migrates old paneCount format from localStorage", () => {
    store["sw:VPL-MIGRATE:panes"] = JSON.stringify({
      paneCount: 3,
      paneApps: ["chat", "editor", "diff"],
      paneWidths: [33, 33, 34],
    });

    let ctx!: PaneContextValue;
    renderProvider((v) => { ctx = v; }, { ticketKey: "VPL-MIGRATE" });

    // Should have migrated paneCount=3 to paneVisible=[true, true, true]
    expect(ctx.paneVisible[0]).toBe(true);
    expect(ctx.paneVisible[1]).toBe(true);
    expect(ctx.paneVisible[2]).toBe(true);
    expect(ctx.paneCount).toBe(3);
  });
});
