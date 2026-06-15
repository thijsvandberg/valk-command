import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditableTitle } from "./EditableTitle";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) { super(`Request failed (${status})`); this.status = status; }
  },
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  tickets: {},
}));

function renderTitle(overrides: {
  ticketKey?: string;
  initialTitle?: string;
  serverLocalEdit?: { value: string; isDraft: boolean; modifiedAt?: string };
  onLocalEdit?: (hasEdit: boolean, value?: string | null) => void;
  onEditingChange?: (isEditing: boolean) => void;
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
      onSaved={overrides.onSaved}
    />,
  );
  return { ...result, onLocalEdit, onEditingChange };
}

describe("EditableTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ modifiedAt: "2026-06-12T10:00:00.000Z" });
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
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-1/local-edits",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({ field: "title", localValue: "New title", isDraft: true }),
        }),
      );
    });
  });

  it("saves on blur", async () => {
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Old title" });
    fireEvent.click(screen.getByText("Old title"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Saved via blur" } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-1/local-edits",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({ field: "title", localValue: "Saved via blur", isDraft: true }),
        }),
      );
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
    expect(mockApiFetch).not.toHaveBeenCalled();
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

    expect(mockApiFetch).not.toHaveBeenCalled();
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
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("displays server local edit value instead of initialTitle", () => {
    renderTitle({
      initialTitle: "Server title",
      serverLocalEdit: { value: "Local override", isDraft: false },
    });
    expect(screen.getByText("Local override")).toBeInTheDocument();
  });

  it("calls onLocalEdit(true, value) once on mount when serverLocalEdit exists", () => {
    const onLocalEdit = vi.fn();
    renderTitle({
      serverLocalEdit: { value: "Modified", isDraft: false },
      onLocalEdit,
    });
    expect(onLocalEdit).toHaveBeenCalledWith(true, "Modified");
    expect(onLocalEdit).toHaveBeenCalledTimes(1);
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

  it("sends the seeded modifiedAt as baseModifiedAt on save (BRDG-340)", async () => {
    renderTitle({
      ticketKey: "VPL-1",
      initialTitle: "Original",
      serverLocalEdit: { value: "Local override", isDraft: true, modifiedAt: "SEEDED" },
    });
    fireEvent.click(screen.getByText("Local override"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Newer title" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-1/local-edits",
        expect.objectContaining({
          body: expect.objectContaining({ baseModifiedAt: "SEEDED" }),
        }),
      );
    });
  });

  it("hands the typed value to onLocalEdit so push can use it without a refetch", async () => {
    const onLocalEdit = vi.fn();
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Old title", onLocalEdit });
    fireEvent.click(screen.getByText("Old title"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "New title" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(onLocalEdit).toHaveBeenCalledWith(true, "New title");
    });
  });

  it("shows the new title after save without flashing back to the old one", async () => {
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Old title" });
    fireEvent.click(screen.getByText("Old title"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "New title" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    // The heading reflects the new title immediately and the old one is gone.
    await waitFor(() => {
      expect(screen.getByText("New title")).toBeInTheDocument();
    });
    expect(screen.queryByText("Old title")).not.toBeInTheDocument();
  });

  it("reverts to the previous title when the persist fails", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("network down"));
    const onLocalEdit = vi.fn();
    renderTitle({ ticketKey: "VPL-1", initialTitle: "Old title", onLocalEdit });
    fireEvent.click(screen.getByText("Old title"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "New title" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Old title")).toBeInTheDocument();
    });
    // The last edit signal clears the local-edit flag since nothing persisted.
    expect(onLocalEdit).toHaveBeenLastCalledWith(false, null);
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
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
