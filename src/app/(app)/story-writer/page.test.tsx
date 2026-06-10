import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionTicket } from "@/types/story-writer";

const push = vi.fn();
const mutate = vi.fn();
const apiFetch = vi.fn().mockResolvedValue({ ok: true });
let swrData: SessionTicket[] | undefined;
let swrLoading = false;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("swr", () => ({
  default: () => ({ data: swrData, error: undefined, isLoading: swrLoading, mutate }),
}));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("@/hooks/useSprintBoard", () => ({ useJiraSprints: () => ({ sprints: [] }) }));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({ mapJiraSprints: () => [] }));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: null, toastLoading: false, showToast: vi.fn(), dismissToast: vi.fn() }),
}));
vi.mock("@/components/ui/Toast", () => ({ Toast: () => null }));
vi.mock("@/components/shared/StoryWriterLauncherModal", () => ({
  StoryWriterLauncherModal: () => null,
}));
vi.mock("@/components/sprint-board/useTicketActions", () => ({
  useTicketActions: () => ({
    readinessMap: {},
    syncFromApiTickets: vi.fn(),
    handleReadinessChange: vi.fn(),
    handleBusinessValueChange: vi.fn(),
    handleStoryPointsChange: vi.fn(),
    handleJiraStatusChange: vi.fn(),
    handleIssueTypeChange: vi.fn(),
    handleTitleChange: vi.fn(),
    handleAssigneeChange: vi.fn(),
    handleEpicChange: vi.fn(),
    handleSprintChange: vi.fn(),
  }),
}));

// Thin BoardRow stub: surfaces the title and the session props/actions so the page's
// wiring (resume, discard, badges) can be exercised without the real row.
vi.mock("@/components/sprint-board/BoardRow", () => ({
  BoardRow: ({
    ticket,
    onActivate,
    onDiscard,
    sessionTimeAgo,
    sessionJiraChanged,
    splitTarget,
  }: {
    ticket: { key: string; title: string };
    onActivate?: (key: string) => void;
    onDiscard?: (key: string) => void;
    sessionTimeAgo?: string;
    sessionJiraChanged?: boolean;
    splitTarget?: string | null;
  }) => (
    <tr>
      <td>
        <button data-testid={`activate-${ticket.key}`} onClick={() => onActivate?.(ticket.key)}>
          {ticket.title}
        </button>
        <button data-testid={`discard-${ticket.key}`} onClick={() => onDiscard?.(ticket.key)}>
          discard
        </button>
        {sessionTimeAgo && <span data-testid={`time-${ticket.key}`}>{sessionTimeAgo}</span>}
        {sessionJiraChanged && <span data-testid={`jira-${ticket.key}`} />}
        {splitTarget !== undefined && <span data-testid={`split-${ticket.key}`}>{splitTarget}</span>}
      </td>
    </tr>
  ),
}));

import StoryWriterLandingPage from "./page";

function makeRow(overrides: Partial<SessionTicket> = {}): SessionTicket {
  return {
    key: "VPL-1",
    title: "Draft one",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    sessionId: "sess-1",
    sessionUpdatedAt: "2026-06-01T10:00:00Z",
    sessionJiraUpdatedAt: null,
    targetTicketKey: null,
    targetTitle: null,
    ...overrides,
  } as SessionTicket;
}

describe("StoryWriterLandingPage (BRDG-325)", () => {
  beforeEach(() => {
    push.mockClear();
    mutate.mockClear();
    apiFetch.mockClear();
    swrLoading = false;
    swrData = undefined;
  });

  it("shows the empty state (no card heading) when there are no sessions", () => {
    swrData = [];
    render(<StoryWriterLandingPage />);
    expect(screen.getByText("No active sessions")).toBeInTheDocument();
    expect(screen.queryByText("Continue Story Writer session")).toBeNull();
  });

  it("renders one row per session under the 'Continue Story Writer session' heading with a count badge", () => {
    swrData = [makeRow({ key: "VPL-1", title: "Draft one" }), makeRow({ key: "VPL-2", sessionId: "sess-2", title: "Draft two" })];
    render(<StoryWriterLandingPage />);
    expect(screen.getByText("Continue Story Writer session")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Draft one")).toBeInTheDocument();
    expect(screen.getByText("Draft two")).toBeInTheDocument();
  });

  it("resumes a draft by navigating to its write page on row activation", () => {
    swrData = [makeRow({ key: "VPL-7" })];
    render(<StoryWriterLandingPage />);
    fireEvent.click(screen.getByTestId("activate-VPL-7"));
    expect(push).toHaveBeenCalledWith("/tickets/VPL-7/write");
  });

  it("discards a session via the confirm dialog, then DELETEs by sessionId and revalidates", async () => {
    swrData = [makeRow({ key: "VPL-1", sessionId: "sess-xyz" })];
    render(<StoryWriterLandingPage />);
    fireEvent.click(screen.getByTestId("discard-VPL-1"));
    // Confirm dialog opens; clicking its confirm action fires the DELETE.
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/story-writer/active-sessions?sessionId=sess-xyz",
        { method: "DELETE" },
      );
    });
    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });

  it("passes session badges (time, jira-changed, split) to the row", () => {
    swrData = [
      makeRow({
        key: "VPL-1",
        sessionJiraUpdatedAt: "2026-06-02T10:00:00Z", // newer than sessionUpdatedAt -> changed
        targetTicketKey: "VPL-2",
        targetTitle: "Target story",
      }),
    ];
    render(<StoryWriterLandingPage />);
    expect(screen.getByTestId("time-VPL-1")).toBeInTheDocument();
    expect(screen.getByTestId("jira-VPL-1")).toBeInTheDocument();
    expect(screen.getByTestId("split-VPL-1")).toHaveTextContent("Target story");
  });
});
