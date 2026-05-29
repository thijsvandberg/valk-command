import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutionLogViewer } from "./ExecutionLogViewer";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  storyWriter: {
    getLogs: vi.fn(),
  },
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": ariaLabel,
    icon,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
    icon?: React.ReactNode;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {icon}
      {children}
    </button>
  ),
}));

import { apiFetch, storyWriter } from "@/lib/api-client";

function makeLogMeta(overrides = {}) {
  return {
    id: "log-1",
    taskId: "task-abc-123",
    createdAt: "2024-01-01T12:00:00Z",
    ...overrides,
  };
}

describe("ExecutionLogViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    expect(screen.getByText("Loading\u2026")).toBeInTheDocument();
  });

  it("shows empty state when no logs exist", async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: [] });

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    await waitFor(() => {
      expect(screen.getByText("No logs yet. Send a message to start.")).toBeInTheDocument();
    });
  });

  it("renders log entries when logs are present", async () => {
    const logs = [
      makeLogMeta({ id: "l1", taskId: "task-1" }),
      makeLogMeta({ id: "l2", taskId: "task-2" }),
    ];
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs });

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    await waitFor(() => {
      expect(screen.getByText("task-1")).toBeInTheDocument();
      expect(screen.getByText("task-2")).toBeInTheDocument();
    });
  });

  it("shows 'Execution logs' header", async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: [] });

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    expect(screen.getByText("Execution logs")).toBeInTheDocument();
  });

  it("renders refresh button", async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: [] });

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    });
  });

  it("reloads logs when refresh button is clicked", async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: [] });

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading\u2026")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("expands a log row when clicked to show log detail", async () => {
    const logs = [makeLogMeta({ id: "l1", taskId: "task-abc" })];
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs });
    // getLogs returns empty entries for the expanded detail
    (storyWriter.getLogs as ReturnType<typeof vi.fn>).mockResolvedValue({ log: [] });

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    await waitFor(() => {
      expect(screen.getByText("task-abc")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("task-abc"));

    await waitFor(() => {
      expect(storyWriter.getLogs).toHaveBeenCalledWith("VPL-1", "task-abc");
    });
  });

  it("fetches from the correct API path for the ticket key", async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: [] });

    render(<ExecutionLogViewer ticketKey="VPL-42" />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/tickets/VPL-42/story-writer/logs",
      );
    });
  });

  it("handles empty logs array from API gracefully", async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: undefined });

    render(<ExecutionLogViewer ticketKey="VPL-1" />);

    await waitFor(() => {
      expect(screen.getByText("No logs yet. Send a message to start.")).toBeInTheDocument();
    });
  });

  it("does not auto-refresh when isStreaming is false", async () => {
    vi.useFakeTimers();
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: [] });

    render(<ExecutionLogViewer ticketKey="VPL-1" isStreaming={false} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading\u2026")).not.toBeInTheDocument();
    });

    vi.advanceTimersByTime(10_000);

    // Should only have been called once (initial load), not again
    expect(apiFetch).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("auto-refreshes while isStreaming is true", async () => {
    vi.useFakeTimers();
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ logs: [] });

    render(<ExecutionLogViewer ticketKey="VPL-1" isStreaming={true} />);

    // Flush the initial load
    await vi.runAllTimersAsync();

    vi.advanceTimersByTime(5_000);
    await vi.runAllTimersAsync();

    expect(apiFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
