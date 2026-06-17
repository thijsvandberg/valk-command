import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditableDescription, resolveLocalValue } from "./EditableDescription";

const mockApiFetch = vi.fn();
const mockSyncEditState = vi.fn();

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) { super(`Request failed (${status})`); this.status = status; }
  },
  tickets: {},
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("@/hooks/useTicketEditStateSync", () => ({
  useTicketEditStateSync: () => mockSyncEditState,
}));

vi.mock("./renderMarkdown", () => ({
  renderMarkdown: (content: string) => <div data-testid="rendered-markdown">{content}</div>,
}));

vi.mock("@/components/rich-editor/RichEditor", () => ({
  RichEditor: ({
    value,
    onChange,
    onSave,
    actions,
  }: {
    value: string;
    onChange?: (v: string) => void;
    onSave: () => void;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="rich-editor">
      <span data-testid="editor-value">{value}</span>
      <textarea data-testid="editor-input" value={value} onChange={(e) => onChange?.(e.target.value)} />
      <button data-testid="editor-save" onClick={onSave}>trigger-save</button>
      {actions}
    </div>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("@/hooks/usePrismLanguages", () => ({
  usePrismLanguages: () => {},
}));

function renderDesc(overrides: Partial<React.ComponentProps<typeof EditableDescription>> = {}) {
  const onLocalEdit = vi.fn();
  const onEditingChange = vi.fn();
  const result = render(
    <EditableDescription
      ticketKey={overrides.ticketKey ?? "VPL-1"}
      initialDescription={overrides.initialDescription ?? "Initial description text"}
      onLocalEdit={overrides.onLocalEdit ?? onLocalEdit}
      onEditingChange={overrides.onEditingChange ?? onEditingChange}
      serverLocalEdit={overrides.serverLocalEdit}
      attachments={overrides.attachments}
      onDiscard={overrides.onDiscard}
      onPushToJira={overrides.onPushToJira}
      isPushing={overrides.isPushing}
      pushError={overrides.pushError}
      showConflictWarning={overrides.showConflictWarning}
      overrideConfirmed={overrides.overrideConfirmed}
      onOverrideChange={overrides.onOverrideChange}
      saver={overrides.saver}
      onConflictReload={overrides.onConflictReload}
      titleInitial={overrides.titleInitial}
      titleLocalValue={overrides.titleLocalValue}
    />,
  );
  return { ...result, onLocalEdit, onEditingChange };
}

describe("resolveLocalValue", () => {
  it("returns undefined when localValue is undefined", () => {
    expect(resolveLocalValue(undefined, "desc")).toBeUndefined();
  });

  it("returns the value unchanged when no attachments", () => {
    expect(resolveLocalValue("some text", "desc")).toBe("some text");
  });

  it("resolves attachment placeholders to attachment IDs", () => {
    const attachments = [{ id: "att-1", filename: "image.png" } as never];
    const resolved = resolveLocalValue("![image.png](attachment)", "desc", attachments);
    expect(resolved).toBe("![image.png](/api/attachments/att-1)");
  });

  it("restores images stripped by TipTap", () => {
    const initial = "Description\n\n![photo.png](/api/attachments/att-1)";
    const localValue = "Description";
    const resolved = resolveLocalValue(localValue, initial);
    expect(resolved).toContain("![photo.png](/api/attachments/att-1)");
  });
});

describe("EditableDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({});
    // sendBeacon stub
    Object.defineProperty(navigator, "sendBeacon", {
      value: vi.fn(),
      configurable: true,
    });
  });

  it("renders description content in view mode", () => {
    renderDesc({ initialDescription: "Some description" });
    expect(screen.getByTestId("rendered-markdown")).toBeInTheDocument();
    expect(screen.getByTestId("rendered-markdown")).toHaveTextContent("Some description");
  });

  it("shows 'No description' when description is empty", () => {
    renderDesc({ initialDescription: "" });
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows editor when description area is clicked", () => {
    renderDesc({ initialDescription: "Click to edit" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByTestId("rich-editor")).toBeInTheDocument();
  });

  it("shows editor when 'No description' is clicked", () => {
    renderDesc({ initialDescription: "" });
    fireEvent.click(screen.getByText("No description"));
    expect(screen.getByTestId("rich-editor")).toBeInTheDocument();
  });

  it("calls onEditingChange(true) when entering edit mode", () => {
    const { onEditingChange } = renderDesc({ initialDescription: "Some text" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });

  it("enters edit mode when markdown clicked", () => {
    renderDesc({ initialDescription: "Text" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByTestId("rich-editor")).toBeInTheDocument();
  });

  it("saves and closes editor on Save click", async () => {
    renderDesc({ ticketKey: "VPL-1", initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByTestId("editor-save"));

    await waitFor(() => {
      expect(screen.queryByTestId("rich-editor")).not.toBeInTheDocument();
    });
  });

  it("closes editor on Close click without saving", async () => {
    renderDesc({ initialDescription: "Original", onDiscard: vi.fn() });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    // Nothing changed yet, so the left action reads "Close", not "Discard".
    fireEvent.click(screen.getByText("Close"));

    await waitFor(() => {
      expect(screen.queryByTestId("rich-editor")).not.toBeInTheDocument();
    });

    expect(mockApiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("local-edits"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("renders editor with RichEditor component", () => {
    renderDesc({ initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByTestId("rich-editor")).toBeInTheDocument();
  });

  it("cleans up a cosmetic-only draft and broadcasts the resulting state", async () => {
    mockApiFetch.mockResolvedValue({ editState: "clean" });
    renderDesc({
      ticketKey: "VPL-7",
      initialDescription: "Original",
      // Differs from the Jira version only in blank-line spacing: a no-op draft.
      serverLocalEdit: { value: "Original\n\n", isDraft: true },
    });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-7/local-edits?draftsOnly=true",
        { method: "DELETE" },
      );
    });
    await waitFor(() => {
      expect(mockSyncEditState).toHaveBeenCalledWith("VPL-7", "clean");
    });
  });

  it("renders the single 'Local edits' badge for autosaved local edits", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
    });
    expect(screen.getByText("Local edits")).toBeInTheDocument();
  });

  it("expands the draft diff with resolve actions when 'Local edits' is clicked", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
      onPushToJira: vi.fn().mockResolvedValue(undefined),
    });
    fireEvent.click(screen.getByText("Local edits"));
    expect(screen.getByText("Discard")).toBeInTheDocument();
    expect(screen.getByText("Push to Jira")).toBeInTheDocument();
    // Plain Save is not a resolution: it would leave local changes diverged from Jira.
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("pushes the draft to Jira from the diff card", async () => {
    const onPushToJira = vi.fn().mockResolvedValue(undefined);
    renderDesc({
      ticketKey: "VPL-1",
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
      onPushToJira,
    });
    fireEvent.click(screen.getByText("Local edits"));
    fireEvent.click(screen.getByText("Push to Jira"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-1/local-edits",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({ field: "description", localValue: "Draft value", isDraft: true }),
        }),
      );
    });
    await waitFor(() => {
      expect(onPushToJira).toHaveBeenCalled();
    });
  });

  it("discards the draft from the diff card", () => {
    const onDiscard = vi.fn();
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
      onDiscard,
    });
    fireEvent.click(screen.getByText("Local edits"));
    fireEvent.click(screen.getByText("Discard"));
    expect(onDiscard).toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("local-edits"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("shows 'Push to Jira' in the draft diff card when onPushToJira is provided", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
      onPushToJira: vi.fn().mockResolvedValue(undefined),
    });
    fireEvent.click(screen.getByText("Local edits"));
    expect(screen.getByText("Push to Jira")).toBeInTheDocument();
  });

  it("renders 'Local edits' badge for non-draft local edits", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Final local value", isDraft: false },
    });
    expect(screen.getByText("Local edits")).toBeInTheDocument();
  });

  it("calls onLocalEdit(true) once on mount when serverLocalEdit exists", () => {
    const { onLocalEdit } = renderDesc({
      serverLocalEdit: { value: "Modified", isDraft: false },
    });
    expect(onLocalEdit).toHaveBeenCalledWith(true);
    expect(onLocalEdit).toHaveBeenCalledTimes(1);
  });

  it("expands an inline diff with resolve actions when 'Local edits' is clicked", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Final local value", isDraft: false },
      onPushToJira: vi.fn().mockResolvedValue(undefined),
    });
    fireEvent.click(screen.getByText("Local edits"));
    expect(screen.getByText("Discard")).toBeInTheDocument();
    expect(screen.getByText("Push to Jira")).toBeInTheDocument();
  });

  it("shows 'Push to Jira' button when onPushToJira is provided and there are local edits", () => {
    const onPushToJira = vi.fn().mockResolvedValue(undefined);
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Modified", isDraft: false },
      onPushToJira,
    });
    // Enter edit mode to see the push button
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByText("Push to Jira")).toBeInTheDocument();
  });

  it("shows push error message when pushError is set", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Modified", isDraft: false },
      onPushToJira: vi.fn().mockResolvedValue(undefined),
      pushError: "Push failed",
    });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByText("Push failed")).toBeInTheDocument();
  });
});

describe("EditableDescription autosave-first flow (BRDG-340)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ modifiedAt: "2026-06-12T10:00:00.000Z" });
    Object.defineProperty(navigator, "sendBeacon", {
      value: vi.fn(),
      configurable: true,
    });
  });

  it("renders no Save button in the editing toolbar", () => {
    renderDesc({ initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    // Clean editing session: the left action is a neutral Close, not Discard.
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("morphs the left action from Close to Discard once the content is dirty", async () => {
    renderDesc({ ticketKey: "VPL-9", initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByText("Close")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "New content" } });
    await waitFor(() => {
      expect(screen.getByText("Discard")).toBeInTheDocument();
    });
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("shows a Done link next to Saved that closes the editor without reverting", async () => {
    const onDiscard = vi.fn();
    renderDesc({ ticketKey: "VPL-9", initialDescription: "Original", onDiscard });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "New content" } });

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    }, { timeout: 2500 });
    expect(screen.getByText("Done")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Done"));
    await waitFor(() => {
      expect(screen.queryByTestId("rich-editor")).not.toBeInTheDocument();
    });
    // Done keeps the autosaved work; it must not trigger a discard.
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("shows Saving… while the debounce is pending and Saved once it lands", async () => {
    renderDesc({ ticketKey: "VPL-9", initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));

    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "New content" } });
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    }, { timeout: 2500 });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/tickets/VPL-9/local-edits",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({ field: "description", localValue: "New content", isDraft: true }),
      }),
    );
  });

  it("flushes the pending edit when the editor closes via Cmd-S/save", async () => {
    renderDesc({ ticketKey: "VPL-9", initialDescription: "Original", serverLocalEdit: { value: "Changed body", isDraft: true } });
    fireEvent.click(screen.getByText("Local edits"));
    // Open the editor from the rendered markdown (local value shown)
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByTestId("editor-save"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-9/local-edits",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({ field: "description", localValue: "Changed body", isDraft: true }),
        }),
      );
    });
    expect(screen.queryByTestId("rich-editor")).not.toBeInTheDocument();
  });

  it("stays quiet (no Saved/Done) when pushing a pre-existing edit without typing", async () => {
    const onPushToJira = vi.fn().mockResolvedValue(undefined);
    renderDesc({
      ticketKey: "VPL-9",
      initialDescription: "Original",
      serverLocalEdit: { value: "Changed body", isDraft: true },
      onPushToJira,
    });
    // Open the editor on an existing local edit, type nothing, then push.
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Push to Jira"));

    await waitFor(() => {
      expect(onPushToJira).toHaveBeenCalled();
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("sends the seeded modifiedAt as baseModifiedAt and adopts the returned token", async () => {
    renderDesc({
      ticketKey: "VPL-9",
      initialDescription: "Original",
      serverLocalEdit: { value: "Changed body", isDraft: true, modifiedAt: "SEEDED" },
    });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByTestId("editor-save"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-9/local-edits",
        expect.objectContaining({
          body: expect.objectContaining({ baseModifiedAt: "SEEDED" }),
        }),
      );
    });
  });

  it("shows the cross-tab conflict banner on a 409 and pauses further saves", async () => {
    const { ApiError } = await import("@/lib/api-client");
    mockApiFetch.mockRejectedValueOnce(new (ApiError as unknown as new (s: number) => Error)(409));

    renderDesc({
      ticketKey: "VPL-9",
      initialDescription: "Original",
      serverLocalEdit: { value: "Changed body", isDraft: true },
    });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByTestId("editor-save"));

    await waitFor(() => {
      expect(screen.getByText(/changed in another tab/)).toBeInTheDocument();
    });
    expect(screen.getByText("Overwrite")).toBeInTheDocument();

    // Paused: re-opening and saving again must not issue another PUT.
    const putCalls = () => mockApiFetch.mock.calls.filter(([, init]) => (init as { method?: string })?.method === "PUT").length;
    const before = putCalls();
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByTestId("editor-save"));
    await waitFor(() => {
      expect(screen.queryByTestId("rich-editor")).not.toBeInTheDocument();
    });
    expect(putCalls()).toBe(before);
  });

  it("Overwrite on the banner re-saves blind and clears the conflict", async () => {
    const { ApiError } = await import("@/lib/api-client");
    mockApiFetch.mockRejectedValueOnce(new (ApiError as unknown as new (s: number) => Error)(409));

    renderDesc({
      ticketKey: "VPL-9",
      initialDescription: "Original",
      serverLocalEdit: { value: "Changed body", isDraft: true },
    });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByTestId("editor-save"));
    await waitFor(() => {
      expect(screen.getByText("Overwrite")).toBeInTheDocument();
    });

    mockApiFetch.mockResolvedValue({ modifiedAt: "T2" });
    fireEvent.click(screen.getByText("Overwrite"));

    await waitFor(() => {
      expect(screen.queryByText(/changed in another tab/)).not.toBeInTheDocument();
    });
    const lastPut = mockApiFetch.mock.calls.filter(([, init]) => (init as { method?: string })?.method === "PUT").at(-1)!;
    expect((lastPut[1] as { body: { baseModifiedAt?: string } }).body.baseModifiedAt).toBeUndefined();
  });

  it("shows Reload draft only when onConflictReload is provided and invokes it", async () => {
    const { ApiError } = await import("@/lib/api-client");
    mockApiFetch.mockRejectedValueOnce(new (ApiError as unknown as new (s: number) => Error)(409));
    const onConflictReload = vi.fn();

    renderDesc({
      ticketKey: "VPL-9",
      initialDescription: "Original",
      serverLocalEdit: { value: "Changed body", isDraft: true },
      onConflictReload,
    });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByTestId("editor-save"));

    await waitFor(() => {
      expect(screen.getByText("Reload draft")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Reload draft"));
    expect(onConflictReload).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(/changed in another tab/)).not.toBeInTheDocument();
    });
  });
});

describe("EditableDescription title-only local edits (BRDG)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({});
    Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(), configurable: true });
  });

  it("shows the 'Local edits' badge for a title-only edit (description unchanged)", () => {
    renderDesc({ initialDescription: "Original", titleInitial: "Old title", titleLocalValue: "New title" });
    expect(screen.getByText("Local edits")).toBeInTheDocument();
  });

  it("does not show the badge when the local title equals the Jira title", () => {
    renderDesc({ initialDescription: "Original", titleInitial: "Same title", titleLocalValue: "Same title" });
    expect(screen.queryByText("Local edits")).not.toBeInTheDocument();
  });

  it("shows a visible Push to Jira for a title-only edit without expanding the diff", () => {
    renderDesc({
      initialDescription: "Original",
      titleInitial: "Old title",
      titleLocalValue: "New title",
      onPushToJira: vi.fn().mockResolvedValue(undefined),
    });
    // The description editor never opens for a title-only edit, so the push must
    // be reachable straight from the badge row, not only inside the diff.
    expect(screen.getByText("Push to Jira")).toBeInTheDocument();
  });

  it("expands a title-only edit into a diff with Push and Discard", () => {
    renderDesc({
      initialDescription: "Original",
      titleInitial: "Old title",
      titleLocalValue: "New title",
      onPushToJira: vi.fn().mockResolvedValue(undefined),
    });
    fireEvent.click(screen.getByText("Local edits"));
    expect(screen.getByText("Discard")).toBeInTheDocument();
    expect(screen.getByText("Push to Jira")).toBeInTheDocument();
  });

  it("discards a title-only edit from the badge", () => {
    const onDiscard = vi.fn();
    renderDesc({ initialDescription: "Original", titleInitial: "Old title", titleLocalValue: "New title", onDiscard });
    fireEvent.click(screen.getByText("Local edits"));
    fireEvent.click(screen.getByText("Discard"));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("labels Title and Description sections when both changed", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Changed body", isDraft: true },
      titleInitial: "Old title",
      titleLocalValue: "New title",
    });
    fireEvent.click(screen.getByText("Local edits"));
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });
});

describe("EditableDescription no-op draft persistence (BRDG-350)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ editState: "clean" });
    Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(), configurable: true });
  });

  it("does not beacon a cosmetic-only value on unmount", () => {
    const { unmount } = renderDesc({ ticketKey: "VPL-9", initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    // Trailing blank lines are a serializer round-trip artefact, not a real edit.
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "Original\n\n" } });
    unmount();
    expect(vi.mocked(navigator.sendBeacon)).not.toHaveBeenCalled();
  });

  it("still beacons a genuine pending edit on unmount", () => {
    const { unmount } = renderDesc({ ticketKey: "VPL-9", initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    // Unmount before the 800ms debounce lands so a timer is still pending.
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "New content" } });
    unmount();
    expect(vi.mocked(navigator.sendBeacon)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(navigator.sendBeacon).mock.calls[0][0]).toBe("/api/tickets/VPL-9/local-edits");
  });

  it("does not beacon when a real edit is reverted to a cosmetic-only value", () => {
    const { unmount } = renderDesc({ ticketKey: "VPL-9", initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "New content" } });
    // Reverting cancels the pending autosave so the pre-revert value is not flushed.
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "Original\n\n" } });
    unmount();
    expect(vi.mocked(navigator.sendBeacon)).not.toHaveBeenCalled();
  });

  it("cleans up an existing draft when reverting to a cosmetic-only value and closing", async () => {
    renderDesc({ ticketKey: "VPL-9", initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "New content" } });
    fireEvent.change(screen.getByTestId("editor-input"), { target: { value: "Original\n\n" } });
    fireEvent.click(screen.getByTestId("editor-save"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-9/local-edits?draftsOnly=true",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  // BRDG-349: live size indicator in the editor toolbar.
  describe("Jira size indicator", () => {
    it("stays hidden when the description is comfortably under the limit", () => {
      renderDesc({ initialDescription: "Short enough" });
      fireEvent.click(screen.getByTestId("rendered-markdown"));
      expect(screen.queryByText(/Jira size limit/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/over limit/i)).not.toBeInTheDocument();
    });

    it("shows a subtle near-limit hint within ~10% of the limit", () => {
      renderDesc({ initialDescription: "x".repeat(30000) });
      fireEvent.click(screen.getByTestId("rendered-markdown"));
      expect(screen.getByText("Near Jira size limit")).toBeInTheDocument();
      expect(screen.queryByText(/over limit/i)).not.toBeInTheDocument();
    });

    it("shows the exact amount over once the limit is exceeded", () => {
      renderDesc({ initialDescription: "x".repeat(32767 + 1240) });
      fireEvent.click(screen.getByTestId("rendered-markdown"));
      expect(screen.getByText("1,240 over limit")).toBeInTheDocument();
      expect(screen.queryByText("Near Jira size limit")).not.toBeInTheDocument();
    });
  });
});
