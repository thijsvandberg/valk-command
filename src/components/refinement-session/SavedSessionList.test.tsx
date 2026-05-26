import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SavedSessionList } from "./SavedSessionList";
import type { RefinementSessionResponse } from "@/lib/api-client";
import type { KeyedMutator } from "swr";

vi.mock("@/lib/api-client", () => ({
  refinementSessions: {
    create: vi.fn().mockResolvedValue({ id: "new-id", name: "Refinement 2026-05-23" }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockSessions: RefinementSessionResponse[] = [
  {
    id: "s1",
    name: "Sprint 42",
    ticketKeys: ["VPL-1", "VPL-2"],
    ticketCount: 2,
    status: "draft",
    generalComment: null,
    currentIndex: 0,
    createdAt: "2026-05-20T10:00:00Z",
    updatedAt: "2026-05-20T10:00:00Z",
  },
  {
    id: "s2",
    name: "Sprint 43",
    ticketKeys: ["VPL-3"],
    ticketCount: 1,
    status: "completed",
    generalComment: null,
    currentIndex: 0,
    createdAt: "2026-05-21T10:00:00Z",
    updatedAt: "2026-05-21T10:00:00Z",
  },
];

describe("SavedSessionList", () => {
  let mockMutate: KeyedMutator<RefinementSessionResponse[]>;
  let mockOnSelect: (id: string) => void;

  beforeEach(() => {
    mockMutate = vi.fn().mockResolvedValue(undefined) as unknown as KeyedMutator<RefinementSessionResponse[]>;
    mockOnSelect = vi.fn();
    vi.clearAllMocks();
  });

  it("renders saved sessions without quick session tab", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    expect(screen.queryByText("Quick session")).not.toBeInTheDocument();
    expect(screen.getByText("Sprint 42")).toBeInTheDocument();
    expect(screen.getByText("Sprint 43")).toBeInTheDocument();
  });

  it("shows ticket count badges", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("does not render when sessions array is empty", () => {
    const { container } = render(
      <SavedSessionList
        sessions={[]}
        mutate={mockMutate}
        activeSessionId={null}
        onSelectSession={mockOnSelect}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("calls onSelectSession when clicking a session", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    fireEvent.click(screen.getByText("Sprint 43"));
    expect(mockOnSelect).toHaveBeenCalledWith("s2");
  });

  it("shows rename and delete buttons for each session", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    expect(screen.getAllByLabelText("Rename session")).toHaveLength(2);
    expect(screen.getAllByLabelText("Delete session")).toHaveLength(2);
  });

  it("opens delete confirmation dialog", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    const deleteButtons = screen.getAllByLabelText("Delete session");
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText("Delete session")).toBeInTheDocument();
    expect(screen.getByText(/Delete "Sprint 42"/)).toBeInTheDocument();
  });

  it("enters inline edit mode on rename click", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    const renameButtons = screen.getAllByLabelText("Rename session");
    fireEvent.click(renameButtons[0]);

    const input = screen.getByDisplayValue("Sprint 42");
    expect(input).toBeInTheDocument();
  });
});
