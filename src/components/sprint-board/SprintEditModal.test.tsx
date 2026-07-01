import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SprintEditModal } from "./SprintEditModal";
import type { Sprint, Ticket } from "@/types/ticket";

// The modal mutates through the provider-bound useSWRConfig().mutate (BRDG-458);
// expose the same spy on both paths so the existing assertions stay meaningful.
vi.mock("swr", () => {
  const mutate = vi.fn();
  return {
    __esModule: true,
    default: () => ({ data: undefined }),
    mutate,
    useSWRConfig: () => ({ mutate }),
  };
});

vi.mock("@/lib/api-client", () => ({
  jira: {
    updateSprint: vi.fn(),
    startSprint: vi.fn(),
  },
  workspaceTasks: {
    create: vi.fn(),
    streamUrl: vi.fn((id: string) => `/api/workspace-tasks/${id}/stream`),
  },
}));

import { jira, workspaceTasks } from "@/lib/api-client";
import { mutate } from "swr";

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
    expect(screen.getByDisplayValue("BT: 137")).toBeInTheDocument();
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
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("patches the SWR sprints cache directly so the edit shows immediately", async () => {
    vi.mocked(jira.updateSprint).mockResolvedValue({ ok: true });

    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Existing goal text"), {
      target: { value: "New sprint goal" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        "/api/jira/sprints",
        expect.any(Function),
        { revalidate: false },
      );
    });

    // The updater must merge the changed fields onto the matching sprint without
    // refetching, so the saved value survives the stale server cache.
    const updater = vi.mocked(mutate).mock.calls[0][1] as (
      current: unknown,
    ) => unknown;
    const next = updater({
      sprints: [
        { id: 100, name: "BT: 137", goal: "Existing goal text", startDate: null },
        { id: 200, name: "Other", goal: "keep", startDate: null },
      ],
      backlogCount: 5,
    }) as { sprints: Array<{ id: number; goal: string }>; backlogCount: number };

    expect(next.sprints[0].goal).toBe("New sprint goal");
    expect(next.sprints[1].goal).toBe("keep");
    expect(next.backlogCount).toBe(5);
  });

  it("saves updated sprint name to Jira", async () => {
    vi.mocked(jira.updateSprint).mockResolvedValue({ ok: true });

    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    const nameInput = screen.getByDisplayValue("BT: 137");
    fireEvent.change(nameInput, { target: { value: "ARIE Sprint" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(jira.updateSprint).toHaveBeenCalledWith(
        "100",
        expect.objectContaining({ name: "ARIE Sprint" }),
      );
    });
  });

  it("does not send name when it is only whitespace", async () => {
    vi.mocked(jira.updateSprint).mockResolvedValue({ ok: true });

    render(
      <SprintEditModal
        sprint={makeSprint()}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    const nameInput = screen.getByDisplayValue("BT: 137");
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(jira.updateSprint).not.toHaveBeenCalled();
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

  it("does not offer Start sprint for an active sprint", () => {
    render(
      <SprintEditModal
        sprint={makeSprint({ state: "active" })}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );
    expect(screen.queryByText("Start sprint")).not.toBeInTheDocument();
  });

  it("starts a future sprint with a valid end date", async () => {
    vi.mocked(jira.startSprint).mockResolvedValue({
      ok: true,
      startDate: "2026-06-05T00:00:00.000Z",
      endDate: "2026-06-18T17:00:00.000Z",
    });

    // A clearly-future end date that carries a time, so the start gate opens
    // regardless of the wall clock the test runs under.
    const futureEnd = new Date(Date.now() + 10 * 86_400_000);
    futureEnd.setHours(17, 0, 0, 0);

    render(
      <SprintEditModal
        sprint={makeSprint({ state: "future", endDate: futureEnd.toISOString() })}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    const startButton = screen.getByText("Start sprint");
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(jira.startSprint).toHaveBeenCalledWith(
        "100",
        expect.objectContaining({ endDate: expect.any(String) }),
      );
    });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Sprint "BT: 137" started');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables Start sprint until the end date carries a time", () => {
    // Local midnight so toInputDateTime keeps it time-less regardless of the
    // test timezone (a UTC-midnight ISO would gain a local time and pass the gate).
    const timelessEnd = new Date(2026, 11, 16).toISOString();
    render(
      <SprintEditModal
        sprint={makeSprint({ state: "future", endDate: timelessEnd })}
        tickets={[makeTicket()]}
        onClose={onClose}
        showToast={showToast}
      />,
    );

    expect(screen.getByText("Start sprint")).toBeDisabled();
    expect(screen.getByText("Add an end time to start")).toBeInTheDocument();
    expect(jira.startSprint).not.toHaveBeenCalled();
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
