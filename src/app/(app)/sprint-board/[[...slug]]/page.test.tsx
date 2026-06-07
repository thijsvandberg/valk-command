import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SprintBoardPage from "./page";

// Configurable route params so each test can simulate a different board URL.
let mockSlug: string[] | undefined;
const pushMock = vi.fn();
const replaceMock = vi.fn();
// Opening/switching a ticket updates the URL via window.history.pushState (not the
// Next router) so the board does not remount; assert on this spy instead of push.
const pushStateMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: pushMock, replace: replaceMock, prefetch: vi.fn() }),
  useParams: () => ({ slug: mockSlug }),
  usePathname: () => `/sprint-board${mockSlug ? "/" + mockSlug.join("/") : ""}`,
}));

// The real side panel pulls in many ticket-detail hooks; stub it so the tests
// focus on URL <-> panel sync. It echoes the ticket key and exposes close.
vi.mock("@/components/sprint-board/SidePanel", () => ({
  SidePanel: ({ ticket, onClose }: { ticket: { key: string }; onClose: () => void }) => (
    <div data-testid="side-panel">
      <span data-testid="panel-ticket">{ticket.key}</span>
      <button onClick={onClose}>close panel</button>
    </div>
  ),
}));

// Stable references to prevent infinite re-render loops in useEffect deps
const MOCK_SPRINTS = [
  { id: 10048, name: "BT: 134", state: "active", startDate: "2026-03-31", endDate: "2026-04-09" },
  { id: 10050, name: "BT Sprint 135", state: "future", startDate: null, endDate: null },
];
const MOCK_TICKETS = [
  {
    key: "VPL-29223",
    title: "Monitoring Kibana dashboards",
    type: "task",
    epic: null,
    epicKey: null,
    jiraStatus: "IN PROGRESS",
    storyPoints: 3,
    assignee: { name: "Jan de Vries", initials: "JV", color: "#4a90d9" },
    flagged: false,
    poStatus: null,
    qualityScore: null,
    editState: "clean" as const,
    notes: "",
  },
];
const MOCK_MUTATE = vi.fn();
const MOCK_SPRINTS_RESULT = { sprints: MOCK_SPRINTS, backlogCount: 0, data: { sprints: MOCK_SPRINTS, backlogCount: 0 } };
const MOCK_TICKETS_RESULT = { data: MOCK_TICKETS, isLoading: false, mutate: MOCK_MUTATE };

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => MOCK_SPRINTS_RESULT,
  useTickets: () => MOCK_TICKETS_RESULT,
  useTicketDetail: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }),
  useDebouncedCallback: (fn: (...args: unknown[]) => void) => fn,
}));

const MOCK_SAVED_SLOTS = [
  { slotIndex: 0, sprintId: "10048", sprintName: "BT: 134" },
];

beforeEach(() => {
  mockSlug = undefined;
  pushMock.mockClear();
  replaceMock.mockClear();
  pushStateMock.mockClear();
  vi.spyOn(window.history, "pushState").mockImplementation(pushStateMock);
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/sprint-slots")) {
      return Promise.resolve(new Response(JSON.stringify(MOCK_SAVED_SLOTS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    return Promise.resolve(new Response("null", { status: 200 }));
  });
});

describe("SprintBoardPage", () => {
  it("renders the sprint board with sprint slots", async () => {
    render(<SprintBoardPage />);
    await waitFor(() => {
      expect(screen.getAllByText("BT: 134").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders ticket table with API data", async () => {
    render(<SprintBoardPage />);
    await waitFor(() => {
      expect(screen.getByText("VPL-29223")).toBeInTheDocument();
    });
    expect(screen.getByText(/Monitoring Kibana/)).toBeInTheDocument();
  });

  it("renders filter buttons", () => {
    render(<SprintBoardPage />);
    expect(screen.getAllByText("Status").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Epic").length).toBeGreaterThanOrEqual(1);
  });
});

// BRDG-270: the open ticket lives in the URL path.
describe("SprintBoard URL <-> side panel sync", () => {
  it("writes the ticket to the URL when a row is selected", async () => {
    mockSlug = ["bt-134"];
    render(<SprintBoardPage />);
    const row = await screen.findByText(/Monitoring Kibana/);
    fireEvent.click(row);
    await waitFor(() => expect(pushStateMock).toHaveBeenCalled());
    expect(pushStateMock.mock.calls[0][2]).toMatch(/\/sprint-board\/bt-134\/VPL-29223/);
  });

  it("restores the side panel from a ticket in the URL on load", async () => {
    mockSlug = ["bt-134", "VPL-29223"];
    render(<SprintBoardPage />);
    await waitFor(() => expect(screen.getByTestId("side-panel")).toBeInTheDocument());
    expect(screen.getByTestId("panel-ticket")).toHaveTextContent("VPL-29223");
  });

  it("clears the ticket from the URL when the panel closes", async () => {
    mockSlug = ["bt-134", "VPL-29223"];
    render(<SprintBoardPage />);
    const closeBtn = await screen.findByText("close panel");
    fireEvent.click(closeBtn);
    await waitFor(() => expect(pushStateMock).toHaveBeenCalled());
    // Closing drops the ticket segment back to the bare sprint path.
    const lastUrl = pushStateMock.mock.calls.at(-1)?.[2] as string;
    expect(lastUrl).toMatch(/\/sprint-board\/bt-134(\?|$)/);
    expect(lastUrl).not.toMatch(/VPL-29223/);
  });

  it("marks the matching row active on load (clicking it closes the panel)", async () => {
    mockSlug = ["bt-134", "VPL-29223"];
    render(<SprintBoardPage />);
    const row = await screen.findByText(/Monitoring Kibana/);
    fireEvent.click(row);
    // An already-active row toggles closed, so the next URL drops the ticket.
    await waitFor(() => expect(pushStateMock).toHaveBeenCalled());
    const lastUrl = pushStateMock.mock.calls.at(-1)?.[2] as string;
    expect(lastUrl).not.toMatch(/VPL-29223/);
  });
});
