import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ConversationList from "./ConversationList";
import type { Conversation } from "@/types/chat";
import type { ConversationCategory } from "@/lib/conversation-category";

function makeConv(id: string, title: string, createdAt: string, pinned = false): Conversation {
  return { id, title, type: "chat", createdAt, relatedTicket: null, metadata: null, pinned, readAt: null };
}

const now = "2026-05-22T14:00:00Z";

const mockConversations: Conversation[] = [
  makeConv("conv-1", "First conversation", now),
  makeConv("conv-2", "Second conversation", "2026-05-21T16:30:00Z"),
];

const defaultProps = {
  conversations: mockConversations,
  activeId: null as string | null,
  loading: false,
  error: null as string | null,
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
};

const mockStorage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => Object.keys(mockStorage).forEach((k) => delete mockStorage[k]),
    },
    writable: true,
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConversationList", () => {
  it("renders the conversations heading", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByText("Conversations")).toBeInTheDocument();
  });

  it("renders all conversations", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByText("First conversation")).toBeInTheDocument();
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
  });

  it("marks the active conversation as selected", () => {
    render(<ConversationList {...defaultProps} activeId="conv-1" />);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect when a conversation is clicked", () => {
    const onSelect = vi.fn();
    render(<ConversationList {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Second conversation"));
    expect(onSelect).toHaveBeenCalledWith("conv-2");
  });

  it("opens type picker and calls onCreate with type when option clicked", () => {
    const onCreate = vi.fn();
    render(<ConversationList {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByLabelText("New conversation"));
    fireEvent.click(screen.getByText("Chat"));
    expect(onCreate).toHaveBeenCalledWith("chat");
  });

  it("calls onCreate with investigation type", () => {
    const onCreate = vi.fn();
    render(<ConversationList {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByLabelText("New conversation"));
    fireEvent.click(screen.getByText("Investigation"));
    expect(onCreate).toHaveBeenCalledWith("investigation");
  });

  it("calls onDelete when the delete button is clicked", () => {
    const onDelete = vi.fn();
    render(<ConversationList {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Delete First conversation"));
    expect(onDelete).toHaveBeenCalledWith("conv-1");
  });

  it("renders a listbox with correct label", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByRole("listbox", { name: "Conversation list" })).toBeInTheDocument();
  });

  it("shows loading state when loading with no conversations", () => {
    render(<ConversationList {...defaultProps} conversations={[]} loading={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state when no conversations exist", () => {
    render(<ConversationList {...defaultProps} conversations={[]} />);
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("shows 'No matching conversations' when filters active and list is empty", () => {
    render(<ConversationList {...defaultProps} conversations={[]} hasActiveFilters={true} />);
    expect(screen.getByText("No matching conversations")).toBeInTheDocument();
  });

  it("shows error message when error is set", () => {
    render(<ConversationList {...defaultProps} error="Something went wrong" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows filter toggle button when multiple categories exist", () => {
    const categoryCounts: Record<ConversationCategory, number> = {
      chat: 2, task: 0, investigation: 0, "story-writer": 0,
      "sprint-goal": 1, stakeholder: 0, review: 0, "ticket-chat": 0,
    };
    render(
      <ConversationList
        {...defaultProps}
        categoryCounts={categoryCounts}
        activeFilters={new Set<ConversationCategory>()}
        onToggleFilter={vi.fn()}
        onClearFilters={vi.fn()}
        filtersVisible={false}
        onToggleFiltersVisible={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("conversation-filter-bar")).not.toBeInTheDocument();
  });

  it("shows filter bar when filtersVisible is true", () => {
    const categoryCounts: Record<ConversationCategory, number> = {
      chat: 2, task: 0, investigation: 0, "story-writer": 0,
      "sprint-goal": 1, stakeholder: 0, review: 0, "ticket-chat": 0,
    };
    render(
      <ConversationList
        {...defaultProps}
        categoryCounts={categoryCounts}
        activeFilters={new Set<ConversationCategory>()}
        onToggleFilter={vi.fn()}
        onClearFilters={vi.fn()}
        filtersVisible={true}
        onToggleFiltersVisible={vi.fn()}
      />,
    );
    expect(screen.getByTestId("conversation-filter-bar")).toBeInTheDocument();
  });

  it("renders category icon color on conversation items", () => {
    const convs: Conversation[] = [
      makeConv("sg-1", "Sprint Goal: BT: 137", now),
    ];
    render(<ConversationList {...defaultProps} conversations={convs} />);
    const button = screen.getByText("Sprint Goal: BT: 137").closest("button");
    expect(button?.className).toContain("border-l-2");
  });
});

describe("ConversationList - collapsed mode", () => {
  it("hides heading in collapsed mode", () => {
    render(<ConversationList {...defaultProps} collapsed={true} />);
    expect(screen.queryByText("Conversations")).not.toBeInTheDocument();
  });

  it("shows collapse toggle button", () => {
    const onToggleCollapsed = vi.fn();
    render(<ConversationList {...defaultProps} onToggleCollapsed={onToggleCollapsed} />);
    const btn = screen.getByTestId("sidebar-collapse-toggle");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onToggleCollapsed).toHaveBeenCalled();
  });

  it("hides search input in collapsed mode", () => {
    render(<ConversationList {...defaultProps} collapsed={true} />);
    expect(screen.queryByTestId("conversation-search")).not.toBeInTheDocument();
  });
});

describe("ConversationList - search", () => {
  it("filters conversations by title", () => {
    render(<ConversationList {...defaultProps} />);
    const input = screen.getByTestId("conversation-search");
    fireEvent.change(input, { target: { value: "First" } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("First conversation")).toBeInTheDocument();
    expect(screen.queryByText("Second conversation")).not.toBeInTheDocument();
  });

  it("shows no results when search matches nothing", () => {
    render(<ConversationList {...defaultProps} />);
    const input = screen.getByTestId("conversation-search");
    fireEvent.change(input, { target: { value: "zzzzz" } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("clears search on Escape", () => {
    render(<ConversationList {...defaultProps} />);
    const input = screen.getByTestId("conversation-search");
    fireEvent.change(input, { target: { value: "xyz" } });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.keyDown(input, { key: "Escape" });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("First conversation")).toBeInTheDocument();
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
  });

  it("clears search on clear button click", () => {
    render(<ConversationList {...defaultProps} />);
    const input = screen.getByTestId("conversation-search");
    fireEvent.change(input, { target: { value: "First" } });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.click(screen.getByLabelText("Clear search"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("First conversation")).toBeInTheDocument();
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
  });

  it("search is case-insensitive", () => {
    render(<ConversationList {...defaultProps} />);
    const input = screen.getByTestId("conversation-search");
    fireEvent.change(input, { target: { value: "first" } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("First conversation")).toBeInTheDocument();
    expect(screen.queryByText("Second conversation")).not.toBeInTheDocument();
  });
});

describe("ConversationList - date grouping", () => {
  it("renders date group headers", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByTestId("group-header-Today")).toBeInTheDocument();
    expect(screen.getByTestId("group-header-Yesterday")).toBeInTheDocument();
  });

  it("collapses a group when header is clicked", () => {
    render(<ConversationList {...defaultProps} />);
    const header = screen.getByTestId("group-header-Yesterday");
    fireEvent.click(header);
    expect(screen.queryByText("Second conversation")).not.toBeInTheDocument();
  });

  it("expands a collapsed group when header is clicked again", () => {
    render(<ConversationList {...defaultProps} />);
    const header = screen.getByTestId("group-header-Yesterday");
    fireEvent.click(header);
    expect(screen.queryByText("Second conversation")).not.toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
  });
});

describe("ConversationList - pinned conversations", () => {
  it("shows pinned section when conversations are pinned", () => {
    const convs = [
      makeConv("p-1", "Pinned conv", now, true),
      makeConv("u-1", "Unpinned conv", now, false),
    ];
    render(<ConversationList {...defaultProps} conversations={convs} />);
    expect(screen.getByTestId("group-header-Pinned")).toBeInTheDocument();
  });

  it("shows context menu on right-click", () => {
    const onTogglePin = vi.fn();
    render(<ConversationList {...defaultProps} onTogglePin={onTogglePin} />);
    const conv = screen.getByText("First conversation");
    fireEvent.contextMenu(conv);
    expect(screen.getByTestId("conversation-context-menu")).toBeInTheDocument();
    expect(screen.getByText("Pin conversation")).toBeInTheDocument();
  });

  it("calls onTogglePin from context menu", () => {
    const onTogglePin = vi.fn();
    render(<ConversationList {...defaultProps} onTogglePin={onTogglePin} />);
    const conv = screen.getByText("First conversation");
    fireEvent.contextMenu(conv);
    fireEvent.click(screen.getByText("Pin conversation"));
    expect(onTogglePin).toHaveBeenCalledWith("conv-1", true);
  });

  it("shows unpin option for pinned conversations", () => {
    const convs = [makeConv("p-1", "Pinned conv", now, true)];
    const onTogglePin = vi.fn();
    render(<ConversationList {...defaultProps} conversations={convs} onTogglePin={onTogglePin} />);
    fireEvent.contextMenu(screen.getByText("Pinned conv"));
    expect(screen.getByText("Unpin conversation")).toBeInTheDocument();
  });
});
