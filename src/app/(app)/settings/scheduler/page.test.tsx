import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-client", () => ({
  scheduler: { status: vi.fn(), run: vi.fn() },
}));

import { scheduler } from "@/lib/api-client";
import SchedulerPage from "./page";

const statusMock = scheduler.status as unknown as ReturnType<typeof vi.fn>;

describe("SchedulerPage data states (BRDG-423)", () => {
  beforeEach(() => {
    statusMock.mockReset();
  });

  it("shows the shared loading state while fetching", () => {
    statusMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SchedulerPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows the shared empty state when no tasks are registered", async () => {
    statusMock.mockResolvedValue({ tasks: [] });
    render(<SchedulerPage />);
    await waitFor(() => {
      expect(screen.getByText("No scheduled tasks registered")).toBeInTheDocument();
    });
  });

  it("surfaces a fetch failure with a retry affordance instead of looking empty", async () => {
    statusMock.mockRejectedValue(new Error("Scheduler is unreachable"));
    render(<SchedulerPage />);
    await waitFor(() => {
      expect(screen.getByText("Scheduler is unreachable")).toBeInTheDocument();
    });
    expect(screen.queryByText("No scheduled tasks registered")).not.toBeInTheDocument();

    // Retry re-queries the scheduler.
    statusMock.mockResolvedValue({ tasks: [] });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => {
      expect(screen.getByText("No scheduled tasks registered")).toBeInTheDocument();
    });
  });
});
