import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SavedSessionList } from "./SavedSessionList";
import { refinementSessions, type RefinementSessionResponse } from "@/lib/api-client";
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
    scheduledFor: null,
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
    scheduledFor: null,
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

  it("caps the session bar to the shared content width so it aligns with the list below (BRDG-361)", () => {
    const { container } = render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );
    const cap = container.querySelector(".max-w-\\[1536px\\]");
    expect(cap).toBeTruthy();
    expect(cap).toContainElement(screen.getByText("Sprint 42"));
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

  it("shows an actions menu trigger for each session", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    expect(screen.getByLabelText("Actions for Sprint 42")).toBeInTheDocument();
    expect(screen.getByLabelText("Actions for Sprint 43")).toBeInTheDocument();
  });

  it("opens delete confirmation dialog from the menu", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for Sprint 42"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.getByText("Delete session")).toBeInTheDocument();
    expect(screen.getByText(/Delete "Sprint 42"/)).toBeInTheDocument();
  });

  it("enters inline edit mode from the menu rename action", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for Sprint 42"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    expect(screen.getByDisplayValue("Sprint 42")).toBeInTheDocument();
  });

  it("marks an active session completed from the menu finish action", async () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for Sprint 42"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Finish refinement" }));

    await waitFor(() => {
      expect(refinementSessions.update).toHaveBeenCalledWith("s1", { status: "completed" });
    });
  });

  it("notifies the parent after finishing so the prep view can reset", async () => {
    const onFinished = vi.fn();
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
        onSessionFinished={onFinished}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for Sprint 42"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Finish refinement" }));

    await waitFor(() => {
      expect(onFinished).toHaveBeenCalledWith("s1");
    });
  });

  it("marks ready sessions as drop targets while a ticket drag is active", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
        dragActive
      />,
    );

    expect(screen.getByText("Sprint 42").closest("[data-drop-target]")).not.toBeNull();
    // Completed sessions never become drop targets.
    expect(screen.getByText("Sprint 43").closest("[data-drop-target]")).toBeNull();
  });

  it("shows no drop affordance when no drag is active", () => {
    const { container } = render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    expect(container.querySelector("[data-drop-target]")).toBeNull();
  });

  it("does not offer a finish action for completed sessions", () => {
    render(
      <SavedSessionList
        sessions={mockSessions}
        mutate={mockMutate}
        activeSessionId="s1"
        onSelectSession={mockOnSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for Sprint 43"));
    expect(screen.queryByRole("menuitem", { name: "Finish refinement" })).not.toBeInTheDocument();
  });
});
