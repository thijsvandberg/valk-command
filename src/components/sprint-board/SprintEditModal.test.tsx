import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SprintEditModal } from "./SprintEditModal";
import type { Sprint, Ticket } from "@/types/ticket";

vi.mock("swr", () => ({
  __esModule: true,
  default: () => ({ data: undefined }),
  mutate: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  jira: {
    updateSprint: vi.fn(),
  },
  workspaceTasks: {
    create: vi.fn(),
    streamUrl: vi.fn((id: string) => `/api/workspace-tasks/${id}/stream`),
  },
}));

import { jira, workspaceTasks } from "@/lib/api-client";

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: "100",
    name: "BT: 137",
    dateRange: "5 May - 16 May",
    state: "active",
    ticketCount: 10,
    startDate: "2026-05-05T00:00:00.000Z",
    endDate: "2026-05-16T00:00:00.000Z",
    goal: "Existing goal text",
    ...overrides,
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test ticket",
    type: "story",
    jiraStatus: "TO DO",
    storyPoints: 3,
    assignee: null,
    epic: "Auth",
    epicKey: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    editState: "clean",
    notes: "",
    businessValue: null,
    ...overrides,
  };
}

describe("SprintEditModal", () => {
  const onClose = vi.fn();
  const showToast = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders modal with sprint details", () => {
    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    expect(screen.getByText("Edit Sprint")).toBeInTheDocument();
    expect(screen.getByText("BT: 137")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing goal text")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onClose when cancel is clicked", () => {
    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("saves updated goal to Jira", async () => {
    vi.mocked(jira.updateSprint).mockResolvedValue({ ok: true });

    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    const textarea = screen.getByDisplayValue("Existing goal text");
    fireEvent.change(textarea, { target: { value: "New sprint goal" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(jira.updateSprint).toHaveBeenCalledWith(
        "100",
        expect.objectContaining({ goal: "New sprint goal" }),
      );
    });
  });

  it("shows error toast on save failure", async () => {
    vi.mocked(jira.updateSprint).mockRejectedValue(new Error("Permission denied"));

    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    const textarea = screen.getByDisplayValue("Existing goal text");
    fireEvent.change(textarea, { target: { value: "New goal" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("Permission denied");
    });
  });

  it("closes without saving when no changes made", async () => {
    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(jira.updateSprint).not.toHaveBeenCalled();
    });
  });

  it("shows AI suggest button", () => {
    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    expect(screen.getByText("Suggest with AI")).toBeInTheDocument();
  });

  it("disables AI suggest when no tickets", () => {
    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    const btn = screen.getByTitle("No tickets to analyze");
    expect(btn).toBeDisabled();
  });
});
