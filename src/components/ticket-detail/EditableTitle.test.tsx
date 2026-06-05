import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditableTitle } from "./EditableTitle";

const mockSaveLocalEdit = vi.fn();
vi.mock("@/lib/api-client", () => ({
  tickets: {
    saveLocalEdit: (...args: unknown[]) => mockSaveLocalEdit(...args),
  },
}));

vi.mock("@/components/shared/Tag", () => ({
  Tag: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="tag" onClick={onClick}>{children}</button>
  ),
}));

function renderTitle(overrides: {
  ticketKey?: string;
  initialTitle?: string;
  serverLocalEdit?: { value: string; isDraft: boolean };
  onLocalEdit?: (hasEdit: boolean) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onViewDiff?: () => void;
  onSaved?: () => void;
} = {}) {
  const onLocalEdit = vi.fn();
  const onEditingChange = vi.fn();
  const result = render(
    <EditableTitle
      ticketKey={overrides.ticketKey ?? "VPL-1"}
      initialTitle={overrides.initialTitle ?? "Initial title"}
      serverLocalEdit={overrides.serverLocalEdit}
      onLocalEdit={overrides.onLocalEdit ?? onLocalEdit}
      onEditingChange={overrides.onEditingChange ?? onEditingChange}
      onViewDiff={overrides.onViewDiff}
      onSaved={overrides.onSaved}
    />,
  );
  return { ...result, onLocalEdit, onEditingChange };
}

describe("EditableTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveLocalEdit.mockResolvedValue({});
  });

  it("renders the initial title", () => {
    renderTitle({ initialTitle: "My ticket title" });
    expect(screen.getByText("My ticket title")).toBeInTheDocument();
  });

  it("shows textarea when title is clicked", () => {
    renderTitle({ initialTitle: "Click to edit" });
    fireEvent.click(screen.getByText("Click to edit"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onEditingChange(true) when entering edit mode", () => {
    const onEditingChange = vi.fn();
    renderTitle({ onEditingChange });
    fireEvent.click(screen.getByText("Initial title"));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });

  it("calls onEditingChange(false) when exiting edit mode", async () => {
    const onEditingChange = vi.fn();
    renderTitle({ onEditingChange });
    fireEvent.click(screen.getByText("Initial title"));
    onEditingChange.mockClear();

    const textarea = screen.getByRole("textbox");
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(onEditingChange).toHaveBeenCalledWith(false);
    });
  });

  it("saves on Enter key", async () => {
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Old title" });
    fireEvent.click(screen.getByText("Old title"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "New title" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(mockSaveLocalEdit).toHaveBeenCalledWith("VPL-1", {
        field: "title",
        localValue: "New title",
      });
    });
  });

  it("saves on blur", async () => {
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Old title" });
    fireEvent.click(screen.getByText("Old title"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Saved via blur" } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(mockSaveLocalEdit).toHaveBeenCalledWith("VPL-1", {
        field: "title",
        localValue: "Saved via blur",
      });
    });
  });

  it("discards on Escape - does not save", async () => {
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Original" });
    fireEvent.click(screen.getByText("Original"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Changed" } });
    fireEvent.keyDown(textarea, { key: "Escape" });

    // After Escape, textarea should be gone
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    // Ensure save was not called
    expect(mockSaveLocalEdit).not.toHaveBeenCalled();
  });

  it("does not save when title is empty", async () => {
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Original" });
    fireEvent.click(screen.getByText("Original"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    expect(mockSaveLocalEdit).not.toHaveBeenCalled();
  });

  it("clears local edit when value matches initialTitle", async () => {
    const onLocalEdit = vi.fn();
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Original", onLocalEdit });
    fireEvent.click(screen.getByText("Original"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Original" } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(onLocalEdit).toHaveBeenCalledWith(false);
    });
    expect(mockSaveLocalEdit).not.toHaveBeenCalled();
  });

  it("renders 'Locally modified' badge when serverLocalEdit is provided", () => {
    renderTitle({
      initialTitle: "Original",
      serverLocalEdit: { value: "Modified", isDraft: false },
    });
    expect(screen.getByText("Locally modified")).toBeInTheDocument();
  });

  it("displays server local edit value instead of initialTitle", () => {
    renderTitle({
      initialTitle: "Server title",
      serverLocalEdit: { value: "Local override", isDraft: false },
    });
    expect(screen.getByText("Local override")).toBeInTheDocument();
  });

  it("calls onLocalEdit(true) once on mount when serverLocalEdit exists", () => {
    const onLocalEdit = vi.fn();
    renderTitle({
      serverLocalEdit: { value: "Modified", isDraft: false },
      onLocalEdit,
    });
    expect(onLocalEdit).toHaveBeenCalledWith(true);
    expect(onLocalEdit).toHaveBeenCalledTimes(1);
  });

  it("calls onViewDiff when badge is clicked", () => {
    const onViewDiff = vi.fn();
    renderTitle({
      serverLocalEdit: { value: "Modified", isDraft: false },
      onViewDiff,
    });
    fireEvent.click(screen.getByText("Locally modified"));
    expect(onViewDiff).toHaveBeenCalled();
  });

  it("does not render badge when no local edit exists", () => {
    renderTitle({ initialTitle: "Clean title" });
    expect(screen.queryByText("Locally modified")).not.toBeInTheDocument();
  });

  it("calls onSaved after persisting a new title", async () => {
    const onSaved = vi.fn();
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Old title", onSaved });
    fireEvent.click(screen.getByText("Old title"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "New title" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("calls onSaved when reverting to the initial title", async () => {
    const onSaved = vi.fn();
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Original", onSaved });
    fireEvent.click(screen.getByText("Original"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Original" } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(mockSaveLocalEdit).not.toHaveBeenCalled();
  });
});
