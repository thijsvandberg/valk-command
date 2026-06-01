import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubtasksSection } from "./SubtasksSection";
import type { Subtask } from "@/types/ticket";

const mockCreateSubtask = vi.fn();
const mockRenameSubtask = vi.fn();
const mockDeleteSubtask = vi.fn();
const mockGetSubtaskSuggestions = vi.fn();
const mockSuggestSubtasks = vi.fn();
const mockPersistSubtaskSuggestions = vi.fn();
const mockDismissSubtaskSuggestion = vi.fn();
const mockRankSubtasks = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    createSubtask: (...args: unknown[]) => mockCreateSubtask(...args),
    renameSubtask: (...args: unknown[]) => mockRenameSubtask(...args),
    deleteSubtask: (...args: unknown[]) => mockDeleteSubtask(...args),
    getSubtaskSuggestions: (...args: unknown[]) => mockGetSubtaskSuggestions(...args),
    suggestSubtasks: (...args: unknown[]) => mockSuggestSubtasks(...args),
    persistSubtaskSuggestions: (...args: unknown[]) => mockPersistSubtaskSuggestions(...args),
    dismissSubtaskSuggestion: (...args: unknown[]) => mockDismissSubtaskSuggestion(...args),
    rankSubtasks: (...args: unknown[]) => mockRankSubtasks(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status = 500, public body?: unknown) {
      super(message);
    }
  },
}));

vi.mock("./ChildIssueRow", () => ({
  ChildIssueRow: ({
    item,
    isEditing,
    editValue,
    onEditChange,
    onSaveEdit,
    onCancelEdit,
    onSelect,
    actionsSlot,
  }: {
    item: Subtask;
    isEditing?: boolean;
    editValue?: string;
    onEditChange?: (v: string) => void;
    onSaveEdit?: () => void;
    onCancelEdit?: () => void;
    onSelect?: (key: string) => void;
    actionsSlot?: React.ReactNode;
  }) => (
    <div data-testid={`subtask-row-${item.key}`}>
      {isEditing ? (
        <input
          data-testid={`edit-input-${item.key}`}
          value={editValue}
          onChange={(e) => onEditChange?.(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={(e) => e.key === "Escape" && onCancelEdit?.()}
        />
      ) : (
        <button onClick={() => onSelect?.(item.key)}>{item.title}</button>
      )}
      {actionsSlot}
    </div>
  ),
}));

vi.mock("./ChildIssueListHeader", () => ({
  ChildIssueListHeader: ({
    title,
    totalCount,
    filteredCount,
    isFiltered,
    setFilter,
  }: {
    title: string;
    totalCount: number;
    filteredCount: number;
    isFiltered: boolean;
    setFilter: (v: string) => void;
    filter: string;
    statusCounts: Record<string, number>;
    fields: unknown[];
    visibleFields: Set<string>;
    onToggleField: (id: string, show: boolean) => void;
    extraActions?: React.ReactNode;
  }) => (
    <div data-testid="child-issue-list-header">
      {title} ({filteredCount}/{totalCount}){isFiltered ? " filtered" : ""}
      <button data-testid="filter-done" onClick={() => setFilter("DONE")}>Filter DONE</button>
      <button data-testid="filter-all" onClick={() => setFilter("all")}>Filter All</button>
    </div>
  ),
}));

vi.mock("./FieldFilterPopover", () => ({
  FieldFilterPopover: () => <div data-testid="field-filter-popover" />,
}));

vi.mock("./SubtaskSuggestions", () => ({
  SubtaskSuggestions: () => <div data-testid="subtask-suggestions" />,
}));

vi.mock("@/components/shared/Avatar", () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

vi.mock("@/hooks/useSectionVisibility", () => ({
  useSectionVisibility: () => ({
    visible: new Set(["issueKey", "status"]),
    toggleField: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLocalStorage", () => ({
  useLocalStorage: (_key: string, initial: unknown) => {
    // Use React.useState so filter updates actually re-render
    const { useState } = require("react");
    return useState(initial);
  },
}));

vi.mock("@/hooks/useTaskStream", () => ({
  useTaskStream: () => {},
}));

vi.mock("@/lib/parse-subtask-suggestions", () => ({
  parseSubtaskSuggestions: () => [],
}));

vi.mock("@/lib/agent-errors", () => ({
  friendlyStreamError: (msg: string) => msg,
  isRetryableStreamError: () => false,
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: (...args: unknown[]) => args,
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  arrayMove: (arr: unknown[], from: number, to: number) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  },
}));

function makeSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    key: "VPL-10",
    title: "A subtask",
    type: "subtask",
    jiraStatus: "TO DO",
    assignee: null,
    ...overrides,
  };
}

function renderSection(subtasks: Subtask[] = []) {
  const onMutate = vi.fn();
  const onSelectTicket = vi.fn();
  const result = render(
    <SubtasksSection
      subtasks={subtasks}
      ticketKey="VPL-1"
      onMutate={onMutate}
      onSelectTicket={onSelectTicket}
    />,
  );
  return { ...result, onMutate, onSelectTicket };
}

describe("SubtasksSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubtaskSuggestions.mockResolvedValue({ suggestions: [] });
    mockCreateSubtask.mockResolvedValue(makeSubtask({ key: "VPL-99", title: "Created" }));
    mockRenameSubtask.mockResolvedValue({});
    mockDeleteSubtask.mockResolvedValue({});
  });

  it("renders inline input with placeholder", () => {
    renderSection();
    expect(screen.getByPlaceholderText("Create subtask...")).toBeInTheDocument();
  });

  it("renders subtask rows", () => {
    const subtasks = [
      makeSubtask({ key: "VPL-10", title: "First subtask" }),
      makeSubtask({ key: "VPL-11", title: "Second subtask" }),
    ];
    renderSection(subtasks);
    expect(screen.getByTestId("subtask-row-VPL-10")).toBeInTheDocument();
    expect(screen.getByTestId("subtask-row-VPL-11")).toBeInTheDocument();
  });

  it("creates subtask on Enter", async () => {
    renderSection();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.change(input, { target: { value: "New subtask" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockCreateSubtask).toHaveBeenCalledWith("VPL-1", { title: "New subtask" });
    });
  });

  it("clears input after submitting subtask", () => {
    renderSection();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.change(input, { target: { value: "New subtask" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("");
  });

  it("clears input on Escape", () => {
    renderSection();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.change(input, { target: { value: "Something" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
  });

  it("does not create subtask on empty input", () => {
    renderSection();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockCreateSubtask).not.toHaveBeenCalled();
  });

  it("shows error when creation fails", async () => {
    mockCreateSubtask.mockRejectedValue(new Error("API error"));
    renderSection();
    const input = screen.getByPlaceholderText("Create subtask...");
    fireEvent.change(input, { target: { value: "Will fail" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText(/Failed to create subtask/)).toBeInTheDocument();
    });
  });

  it("calls onSelectTicket when subtask is clicked", () => {
    const subtasks = [makeSubtask({ key: "VPL-10", title: "Clickable" })];
    const { onSelectTicket } = renderSection(subtasks);
    fireEvent.click(screen.getByText("Clickable"));
    expect(onSelectTicket).toHaveBeenCalledWith("VPL-10");
  });

  it("filters subtasks by status", () => {
    const subtasks = [
      makeSubtask({ key: "VPL-10", title: "Todo subtask", jiraStatus: "TO DO" }),
      makeSubtask({ key: "VPL-11", title: "Done subtask", jiraStatus: "DONE" }),
    ];
    renderSection(subtasks);

    // Click Filter DONE in the header mock
    fireEvent.click(screen.getByTestId("filter-done"));

    expect(screen.getByTestId("subtask-row-VPL-11")).toBeInTheDocument();
    expect(screen.queryByTestId("subtask-row-VPL-10")).not.toBeInTheDocument();
  });

  it("shows all subtasks when filter is reset to 'all'", () => {
    const subtasks = [
      makeSubtask({ key: "VPL-10", title: "Todo subtask", jiraStatus: "TO DO" }),
      makeSubtask({ key: "VPL-11", title: "Done subtask", jiraStatus: "DONE" }),
    ];
    renderSection(subtasks);

    fireEvent.click(screen.getByTestId("filter-done"));
    fireEvent.click(screen.getByTestId("filter-all"));

    expect(screen.getByTestId("subtask-row-VPL-10")).toBeInTheDocument();
    expect(screen.getByTestId("subtask-row-VPL-11")).toBeInTheDocument();
  });

  it("shows 'Edit' and 'Delete' buttons for subtask rows", () => {
    const subtasks = [makeSubtask({ key: "VPL-10", title: "Subtask" })];
    renderSection(subtasks);
    expect(screen.getByTitle("Rename subtask")).toBeInTheDocument();
    expect(screen.getByTitle("Delete subtask")).toBeInTheDocument();
  });

  it("shows inline edit when Edit button is clicked", () => {
    const subtasks = [makeSubtask({ key: "VPL-10", title: "Editable subtask" })];
    renderSection(subtasks);
    fireEvent.click(screen.getByTitle("Rename subtask"));
    expect(screen.getByTestId("edit-input-VPL-10")).toBeInTheDocument();
  });

  it("saves rename on blur", async () => {
    const subtasks = [makeSubtask({ key: "VPL-10", title: "Original name" })];
    renderSection(subtasks);

    fireEvent.click(screen.getByTitle("Rename subtask"));
    const editInput = screen.getByTestId("edit-input-VPL-10");
    fireEvent.change(editInput, { target: { value: "Renamed subtask" } });
    fireEvent.blur(editInput);

    await waitFor(() => {
      expect(mockRenameSubtask).toHaveBeenCalledWith("VPL-1", "VPL-10", { title: "Renamed subtask" });
    });
  });

  it("shows pending delete toast when Delete is clicked", async () => {
    const subtasks = [makeSubtask({ key: "VPL-10", title: "Deletable" })];
    renderSection(subtasks);

    fireEvent.click(screen.getByTitle("Delete subtask"));

    await waitFor(() => {
      expect(screen.getByText(/Deleted.*Deletable/)).toBeInTheDocument();
    });
  });

  it("shows Undo button in pending delete toast", async () => {
    const subtasks = [makeSubtask({ key: "VPL-10", title: "Deletable" })];
    renderSection(subtasks);

    fireEvent.click(screen.getByTitle("Delete subtask"));

    await waitFor(() => {
      expect(screen.getByText("Undo")).toBeInTheDocument();
    });
  });

  it("restores subtask when Undo is clicked", async () => {
    const subtasks = [makeSubtask({ key: "VPL-10", title: "Deletable" })];
    renderSection(subtasks);

    fireEvent.click(screen.getByTitle("Delete subtask"));

    await waitFor(() => {
      expect(screen.getByText("Undo")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Undo"));

    await waitFor(() => {
      expect(screen.queryByText("Undo")).not.toBeInTheDocument();
    });

    // Delete API should not have been called
    expect(mockDeleteSubtask).not.toHaveBeenCalled();
  });
});
