import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditableDescription, resolveLocalValue } from "./EditableDescription";

const mockSaveLocalEdit = vi.fn();
const mockApiFetch = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    saveLocalEdit: (...args: unknown[]) => mockSaveLocalEdit(...args),
  },
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("./renderMarkdown", () => ({
  renderMarkdown: (content: string) => <div data-testid="rendered-markdown">{content}</div>,
}));

vi.mock("@/components/rich-editor/RichEditor", () => ({
  RichEditor: ({
    value,
    onSave,
    actions,
  }: {
    value: string;
    onSave: () => void;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="rich-editor">
      <span data-testid="editor-value">{value}</span>
      <button data-testid="editor-save" onClick={onSave}>Save</button>
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
      onViewDiff={overrides.onViewDiff}
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
    mockSaveLocalEdit.mockResolvedValue({});
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

  it("closes editor on Discard click without saving", async () => {
    renderDesc({ initialDescription: "Original", onDiscard: vi.fn() });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    fireEvent.click(screen.getByText("Discard"));

    await waitFor(() => {
      expect(screen.queryByTestId("rich-editor")).not.toBeInTheDocument();
    });

    expect(mockSaveLocalEdit).not.toHaveBeenCalled();
  });

  it("renders editor with RichEditor component", () => {
    renderDesc({ initialDescription: "Original" });
    fireEvent.click(screen.getByTestId("rendered-markdown"));
    expect(screen.getByTestId("rich-editor")).toBeInTheDocument();
  });

  it("renders 'Unsaved changes' badge for draft local edits", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
    });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("expands the draft diff with resolve actions when 'Unsaved changes' is clicked", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
      onPushToJira: vi.fn().mockResolvedValue(undefined),
    });
    fireEvent.click(screen.getByText("Unsaved changes"));
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
    fireEvent.click(screen.getByText("Unsaved changes"));
    fireEvent.click(screen.getByText("Push to Jira"));

    await waitFor(() => {
      expect(mockSaveLocalEdit).toHaveBeenCalledWith("VPL-1", {
        field: "description",
        localValue: "Draft value",
      });
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
    fireEvent.click(screen.getByText("Unsaved changes"));
    fireEvent.click(screen.getByText("Discard"));
    expect(onDiscard).toHaveBeenCalled();
    expect(mockSaveLocalEdit).not.toHaveBeenCalled();
  });

  it("shows 'Push to Jira' in the draft diff card when onPushToJira is provided", () => {
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Draft value", isDraft: true },
      onPushToJira: vi.fn().mockResolvedValue(undefined),
    });
    fireEvent.click(screen.getByText("Unsaved changes"));
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

  it("calls onViewDiff when 'Local edits' badge is clicked", () => {
    const onViewDiff = vi.fn();
    renderDesc({
      initialDescription: "Original",
      serverLocalEdit: { value: "Final", isDraft: false },
      onViewDiff,
    });
    fireEvent.click(screen.getByText("Local edits"));
    expect(onViewDiff).toHaveBeenCalled();
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
