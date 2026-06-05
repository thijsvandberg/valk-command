import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Sprint, Ticket } from "@/types/ticket";
import { FinishSprintModal } from "./FinishSprintModal";

vi.mock("swr", () => ({
  __esModule: true,
  default: () => ({ data: undefined }),
  mutate: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  jira: { closeSprint: vi.fn() },
  tickets: { getSubtasks: vi.fn(), closeSubtask: vi.fn() },
}));

import { jira, tickets as ticketsApi } from "@/lib/api-client";
import { mutate } from "swr";

const sprint: Sprint = {
  id: "42",
  name: "VPL Sprint 42",
  dateRange: "",
  state: "active",
  ticketCount: 3,
  startDate: "2026-05-08T09:00:00.000Z",
  endDate: "2026-05-21T17:00:00.000Z",
  goal: null,
};

function mkTicket(partial: Partial<Ticket> & { key: string }): Ticket {
  return {
    title: `Title ${partial.key}`,
    jiraStatus: "DONE",
    openSubtaskCount: 0,
    ...partial,
  } as unknown as Ticket;
}

function renderModal(tickets: Ticket[], overrides: Partial<React.ComponentProps<typeof FinishSprintModal>> = {}) {
  const props = {
    sprint,
    tickets,
    earlyClose: false,
    onClose: vi.fn(),
    onCloseAllSubtasks: vi.fn().mockResolvedValue(undefined),
    onRefreshTickets: vi.fn(),
    showToast: vi.fn(),
    onFinished: vi.fn(),
    ...overrides,
  };
  render(<FinishSprintModal {...props} />);
  return props;
}

describe("FinishSprintModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ticketsApi.getSubtasks).mockResolvedValue([]);
  });

  it("renders header and is ready when nothing is open", async () => {
    renderModal([mkTicket({ key: "VPL-1", jiraStatus: "DONE" })]);

    expect(screen.getByRole("heading", { name: "Finish sprint" })).toBeInTheDocument();
    expect(screen.getByText("VPL Sprint 42")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Everything is done. Ready to finish.")).toBeInTheDocument();
    });
    // The confirmation block carries a short summary so the modal is not half-empty.
    expect(screen.getByText("1 story complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish sprint/i })).not.toBeDisabled();
  });

  it("disables Finish and lists incomplete stories (Blocker A)", () => {
    renderModal([
      mkTicket({ key: "VPL-1", title: "Build login", jiraStatus: "IN PROGRESS" }),
      mkTicket({ key: "VPL-2", jiraStatus: "DONE" }),
    ]);

    expect(screen.getByText("1 story is not done")).toBeInTheDocument();
    expect(screen.getByText("Build login")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish sprint/i })).toBeDisabled();
  });

  it("blocks on open subtasks then enables Finish after closing all (Blocker B)", async () => {
    vi.mocked(ticketsApi.getSubtasks).mockResolvedValue([
      { key: "VPL-9", title: "Write tests", status: "TO DO" },
    ]);

    const props = renderModal([
      mkTicket({ key: "VPL-1", title: "Done story", jiraStatus: "DONE", openSubtaskCount: 1 }),
    ]);

    // Finish disabled while the open subtask is present.
    await waitFor(() => {
      expect(screen.getByText("Write tests")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /finish sprint/i })).toBeDisabled();

    // Close all open subtasks across the story.
    fireEvent.click(screen.getByRole("button", { name: "Close all open subtasks" }));

    await waitFor(() => {
      expect(props.onCloseAllSubtasks).toHaveBeenCalledWith("VPL-1");
      expect(screen.getByRole("button", { name: /finish sprint/i })).not.toBeDisabled();
    });
  });

  it("copies the open-subtasks list to the clipboard (Blocker B)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    vi.mocked(ticketsApi.getSubtasks).mockResolvedValue([
      { key: "VPL-46336", title: "Finalize story", status: "TO DO" },
    ]);

    const props = renderModal([
      mkTicket({
        key: "VPL-46187",
        title: "Update gift card transaction code to 904-102",
        jiraStatus: "DONE",
        openSubtaskCount: 1,
        assignee: { name: "Frank", initials: "F", color: "#000" },
      } as Partial<Ticket> & { key: string }),
    ]);

    await waitFor(() => expect(screen.getByText("Finalize story")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Copy open-subtasks list" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "Update gift card transaction code to 904-102 (DONE) - https://new-story.atlassian.net/browse/VPL-46187 (Frank)\n" +
          " - Finalize story (TODO) - https://new-story.atlassian.net/browse/VPL-46336",
      );
      expect(props.showToast).toHaveBeenCalledWith("Copied 1 story to clipboard");
    });
  });

  it("closes a single subtask via the per-item action", async () => {
    vi.mocked(ticketsApi.getSubtasks).mockResolvedValue([
      { key: "VPL-9", title: "Write tests", status: "TO DO" },
    ]);
    vi.mocked(ticketsApi.closeSubtask).mockResolvedValue({ ok: true });

    const props = renderModal([
      mkTicket({ key: "VPL-1", jiraStatus: "DONE", openSubtaskCount: 1 }),
    ]);

    await waitFor(() => expect(screen.getByText("Write tests")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));

    await waitFor(() => {
      expect(ticketsApi.closeSubtask).toHaveBeenCalledWith("VPL-1", "VPL-9");
      expect(props.onRefreshTickets).toHaveBeenCalled();
    });
  });

  it("finishes the sprint when ready", async () => {
    vi.mocked(jira.closeSprint).mockResolvedValue({ ok: true });
    const props = renderModal([mkTicket({ key: "VPL-1", jiraStatus: "DONE" })]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finish sprint/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /finish sprint/i }));

    await waitFor(() => {
      expect(jira.closeSprint).toHaveBeenCalledWith("42");
      expect(mutate).toHaveBeenCalledWith("/api/jira/sprints", expect.any(Function), { revalidate: false });
      expect(props.showToast).toHaveBeenCalled();
      expect(props.onFinished).toHaveBeenCalled();
      expect(props.onClose).toHaveBeenCalled();
    });
  });

  it("optimistically flips the closed sprint to 'closed' in the SWR cache", async () => {
    vi.mocked(jira.closeSprint).mockResolvedValue({ ok: true });
    renderModal([mkTicket({ key: "VPL-1", jiraStatus: "DONE" })]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finish sprint/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /finish sprint/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/api/jira/sprints", expect.any(Function), { revalidate: false }));

    const updater = vi.mocked(mutate).mock.calls.find((c) => c[0] === "/api/jira/sprints")![1] as (
      current: { sprints: Array<{ id: number | string; state: string }> } | undefined,
    ) => { sprints: Array<{ id: number | string; state: string }> };
    const next = updater({ sprints: [{ id: 42, state: "active" }, { id: 7, state: "active" }] });
    expect(next.sprints).toEqual([{ id: 42, state: "closed" }, { id: 7, state: "active" }]);
  });

  it("shows an in-flight loading panel while the sprint is being finished", async () => {
    // Keep the close request pending so the in-flight body state stays mounted.
    let resolveClose: (v: { ok: boolean }) => void = () => {};
    vi.mocked(jira.closeSprint).mockReturnValue(new Promise((res) => { resolveClose = res; }));
    renderModal([mkTicket({ key: "VPL-1", jiraStatus: "DONE" })]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finish sprint/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /finish sprint/i }));

    await waitFor(() => expect(screen.getByText(/Finishing sprint/i)).toBeInTheDocument());
    // The ready confirmation must not show alongside the in-flight panel.
    expect(screen.queryByText("Everything is done. Ready to finish.")).not.toBeInTheDocument();

    resolveClose({ ok: true });
  });

  it("keeps the modal open and shows an error when close fails", async () => {
    vi.mocked(jira.closeSprint).mockRejectedValue(new Error("Scope error"));
    const props = renderModal([mkTicket({ key: "VPL-1", jiraStatus: "DONE" })]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finish sprint/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /finish sprint/i }));

    await waitFor(() => {
      expect(screen.getByText("Scope error")).toBeInTheDocument();
    });
    expect(props.onClose).not.toHaveBeenCalled();
    // The error supersedes the ready confirmation; both must never show together.
    expect(screen.queryByText("Everything is done. Ready to finish.")).not.toBeInTheDocument();
  });

  it("shows the early-close warning", () => {
    renderModal([mkTicket({ key: "VPL-1", jiraStatus: "DONE" })], { earlyClose: true });
    expect(screen.getByText(/end date has not passed yet/i)).toBeInTheDocument();
  });
});
