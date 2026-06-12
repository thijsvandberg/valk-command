import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddToRefinementModal } from "./AddToRefinementModal";

const mockMutate = vi.fn();
let mockSessions = [
  { id: "session-1", name: "Sprint 42 Refinement", status: "draft", ticketKeys: ["VPL-1"], ticketCount: 1 },
  { id: "session-2", name: "Sprint 43 Refinement", status: "in_progress", ticketKeys: [], ticketCount: 0 },
  { id: "session-3", name: "Completed Session", status: "completed", ticketKeys: [], ticketCount: 0 },
];

vi.mock("@/hooks/useRefinementSessions", () => ({
  useRefinementSessions: () => ({
    sessions: mockSessions,
    mutate: mockMutate,
  }),
}));

const mockApiUpdate = vi.fn();
const mockApiCreate = vi.fn();

vi.mock("@/lib/api-client", () => ({
  refinementSessions: {
    update: (...args: unknown[]) => mockApiUpdate(...args),
    create: (...args: unknown[]) => mockApiCreate(...args),
  },
}));

vi.mock("@/components/shared/Modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="modal">{children}</div> : null,
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
    variant?: string;
    size?: string;
    icon?: React.ReactNode;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe("AddToRefinementModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue(undefined);
  });

  it("does not render when closed", () => {
    render(
      <AddToRefinementModal
        open={false}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
      />,
    );
    expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
  });

  it("renders when open", () => {
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
      />,
    );
    expect(screen.getByTestId("modal")).toBeInTheDocument();
    expect(screen.getByText("Add to refinement")).toBeInTheDocument();
  });

  it("shows correct ticket label for single ticket", () => {
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
      />,
    );
    expect(screen.getByText(/Add 1 ticket/)).toBeInTheDocument();
  });

  it("shows correct ticket label for multiple tickets", () => {
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5", "VPL-6"]}
      />,
    );
    expect(screen.getByText(/Add 2 tickets/)).toBeInTheDocument();
  });

  it("only shows draft/in-progress sessions (not completed)", () => {
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
      />,
    );
    expect(screen.getByText("Sprint 42 Refinement")).toBeInTheDocument();
    expect(screen.getByText("Sprint 43 Refinement")).toBeInTheDocument();
    expect(screen.queryByText("Completed Session")).not.toBeInTheDocument();
  });

  it("shows overlap count when ticket already exists in session", () => {
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-1"]}
      />,
    );
    // VPL-1 is already in session-1
    expect(screen.getByText("(1 already in session)")).toBeInTheDocument();
  });

  it("shows no-sessions message when all sessions are completed", () => {
    const savedSessions = mockSessions;
    mockSessions = [{ id: "s1", name: "Done", status: "completed", ticketKeys: [], ticketCount: 0 }];
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
      />,
    );
    expect(screen.getByText("No draft sessions yet.")).toBeInTheDocument();
    mockSessions = savedSessions;
  });

  it("calls api.update and mutate when adding to an existing session", async () => {
    mockApiUpdate.mockResolvedValue({});
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
      />,
    );
    fireEvent.click(screen.getByText("Sprint 42 Refinement"));
    await waitFor(() => {
      expect(mockApiUpdate).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ ticketKeys: expect.arrayContaining(["VPL-1", "VPL-5"]) }),
      );
    });
    expect(mockMutate).toHaveBeenCalled();
  });

  it("calls onAdded with sessionId and name after adding", async () => {
    mockApiUpdate.mockResolvedValue({});
    const onAdded = vi.fn();
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
        onAdded={onAdded}
      />,
    );
    fireEvent.click(screen.getByText("Sprint 42 Refinement"));
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith("session-1", "Sprint 42 Refinement");
    });
  });

  it("calls api.create and mutate when creating a new session", async () => {
    mockApiCreate.mockResolvedValue({ id: "new-session", name: "Refinement 2026-05-29" });
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
      />,
    );
    fireEvent.click(screen.getByText("New session"));
    await waitFor(() => {
      expect(mockApiCreate).toHaveBeenCalledWith({
        name: expect.stringMatching(/^Refinement \d{4}-\d{2}-\d{2}$/),
        ticketKeys: ["VPL-5"],
      });
    });
    expect(mockMutate).toHaveBeenCalled();
  });

  it("calls onAdded after creating a new session", async () => {
    mockApiCreate.mockResolvedValue({ id: "new-session", name: "Refinement 2026-05-29" });
    const onAdded = vi.fn();
    render(
      <AddToRefinementModal
        open={true}
        onClose={vi.fn()}
        ticketKeys={["VPL-5"]}
        onAdded={onAdded}
      />,
    );
    fireEvent.click(screen.getByText("New session"));
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith("new-session", "Refinement 2026-05-29");
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <AddToRefinementModal
        open={true}
        onClose={onClose}
        ticketKeys={["VPL-5"]}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
