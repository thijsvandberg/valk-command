import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StoryWriterLauncherModal } from "./StoryWriterLauncherModal";
import { mutate as globalMutate } from "swr";
import { apiFetch } from "@/lib/api-client";

vi.mock("lucide-react", () => {
  const stub = () => null;
  const names = ["X", "Plus", "BookOpen", "NotebookPen", "Search", "ArrowRight", "History", "Trash2", "IterationCw", "Zap", "Scissors"];
  return Object.fromEntries(names.map((n) => [n, stub]));
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("swr", () => ({
  mutate: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  jira: { getSprints: vi.fn().mockResolvedValue({ sprints: [] }) },
  sprintSlots: { list: vi.fn().mockResolvedValue([]) },
  config: { get: vi.fn().mockResolvedValue({ nextSprintId: "" }) },
  settings: { getDefaultSprint: vi.fn().mockResolvedValue({ sprintId: "" }) },
  storyWriter: { createDraft: vi.fn().mockResolvedValue({}) },
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ onClick, children, icon, ...rest }: Record<string, unknown>) => (
    <button onClick={onClick as React.MouseEventHandler} aria-label={rest["aria-label"] as string}>{icon as React.ReactNode}{children as React.ReactNode}</button>
  ),
}));

vi.mock("@/components/shared/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button aria-label="confirm-discard" onClick={onConfirm}>Discard</button> : null,
}));

vi.mock("@/components/shared/SprintSelectDropdown", () => ({ SprintSelectDropdown: () => null }));
vi.mock("@/components/shared/SessionSelectDropdown", () => ({ SessionSelectDropdown: () => null }));
vi.mock("@/components/shared/StatusBadge", () => ({ StatusBadge: () => null }));
vi.mock("@/components/shared/TextInput", () => ({ TextInput: () => <input /> }));
vi.mock("@/components/shared/IssueTypeIcon", () => ({ IssueTypeIcon: () => null, ISSUE_TYPE_COLORS: {} }));
vi.mock("@/hooks/useOutsideClick", () => ({ useOutsideClick: vi.fn() }));

const SESSIONS = [
  { sessionId: "s1", ticketKey: "BRDG-1", title: "First", sprintName: null, epic: null, epicKey: null, issueType: "story", status: "TO DO", updatedAt: null, targetTicketKey: null, targetTitle: null },
  { sessionId: "s2", ticketKey: "BRDG-2", title: "Second", sprintName: null, epic: null, epicKey: null, issueType: "story", status: "TO DO", updatedAt: null, targetTicketKey: null, targetTitle: null },
];

async function openSessionsTab() {
  render(<StoryWriterLauncherModal open onClose={vi.fn()} />);
  fireEvent.click(screen.getByText("Open session"));
  await screen.findAllByLabelText("Dismiss session");
}

describe("StoryWriterLauncherModal session delete (BRDG-334)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") return Promise.resolve({});
      if (url === "/api/story-writer/active-sessions") return Promise.resolve(SESSIONS);
      return Promise.resolve({});
    });
  });

  it("optimistically patches the active-sessions SWR key so sidebar and badges update instantly", async () => {
    await openSessionsTab();

    fireEvent.click(screen.getAllByLabelText("Dismiss session")[0]);
    fireEvent.click(screen.getByLabelText("confirm-discard"));

    expect(globalMutate).toHaveBeenCalledWith(
      "/api/story-writer/active-sessions",
      expect.any(Function),
      { revalidate: false },
    );
    const updater = vi.mocked(globalMutate).mock.calls.find((c) => typeof c[1] === "function")![1] as
      (current?: { sessionId: string }[]) => { sessionId: string }[];
    expect(updater(SESSIONS).map((s) => s.sessionId)).toEqual(["s2"]);
    expect(updater(undefined)).toEqual([]);
  });

  it("removes the session row from the modal and calls the DELETE endpoint", async () => {
    await openSessionsTab();

    fireEvent.click(screen.getAllByLabelText("Dismiss session")[0]);
    fireEvent.click(screen.getByLabelText("confirm-discard"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/story-writer/active-sessions?sessionId=s1",
        { method: "DELETE" },
      );
    });
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("revalidates the active-sessions key when the DELETE fails, rolling back the patch", async () => {
    vi.mocked(apiFetch).mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") return Promise.reject(new Error("boom"));
      if (url === "/api/story-writer/active-sessions") return Promise.resolve(SESSIONS);
      return Promise.resolve({});
    });
    await openSessionsTab();

    fireEvent.click(screen.getAllByLabelText("Dismiss session")[0]);
    fireEvent.click(screen.getByLabelText("confirm-discard"));

    await waitFor(() => {
      expect(globalMutate).toHaveBeenCalledWith("/api/story-writer/active-sessions");
    });
  });
});
