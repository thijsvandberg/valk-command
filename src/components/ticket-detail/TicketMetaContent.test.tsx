import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketMetaContent } from "./TicketMetaContent";
import type { Ticket, TicketDetail } from "@/types/ticket";

vi.mock("lucide-react", () => {
  const stub = () => null;
  return Object.fromEntries(["ChevronDown", "AlertTriangle", "Play", "Gem"].map((n) => [n, stub]));
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) => (
    <a href={href as string} {...rest}>{children as React.ReactNode}</a>
  ),
}));

const updateStoryPoints = vi.fn().mockResolvedValue({});
const updateMetadata = vi.fn().mockResolvedValue({});
const updateEpic = vi.fn().mockResolvedValue({});
const moveSprint = vi.fn().mockResolvedValue({});
const apiFetch = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  tickets: {
    updateStoryPoints: (...args: unknown[]) => updateStoryPoints(...args),
    updateMetadata: (...args: unknown[]) => updateMetadata(...args),
    updateEpic: (...args: unknown[]) => updateEpic(...args),
    updateLabels: vi.fn().mockResolvedValue({}),
  },
  jira: { assign: vi.fn().mockResolvedValue({}), moveSprint: (...args: unknown[]) => moveSprint(...args) },
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [{ id: 1, name: "Sprint 1" }, { id: 2, name: "Sprint 2" }] }),
  useSprintSlots: () => ({ data: [] }),
  useDevInfo: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/useTicketSessionMap", () => ({ useTicketSessionMap: () => ({ ticketSessionMap: new Map() }) }));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, jiraStatus, onJiraStatusChange }: { ticketKey: string; jiraStatus?: string; onJiraStatusChange?: (s: string) => void }) =>
    onJiraStatusChange ? (
      <button data-testid="status-pill" onClick={() => onJiraStatusChange("DONE")}>{jiraStatus}</button>
    ) : (
      <span>{jiraStatus ?? ticketKey}</span>
    ),
}));
vi.mock("@/components/shared/Avatar", () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock("@/components/shared/WatchersRow", () => ({ WatchersRow: ({ ticketKey }: { ticketKey: string }) => <span data-testid="watchers-row">{ticketKey}</span> }));
vi.mock("@/components/shared/Tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/shared/Tag", () => ({ Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/shared/ReadinessCell", () => ({ ReadinessCell: () => <span data-testid="readiness-cell" /> }));
vi.mock("@/components/shared/BusinessValuePicker", () => ({ BusinessValuePicker: ({ value }: { value: number | null }) => <span data-testid="bv-picker">{value}</span> }));
vi.mock("@/components/shared/StoryPointPicker", () => ({ StoryPointPicker: ({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) => <button data-testid="sp-picker" onClick={() => onChange(8)}>{value}</button> }));
vi.mock("@/components/shared/AssigneePicker", () => ({ AssigneePicker: ({ value }: { value: { name: string } | null }) => <span data-testid="assignee-picker">{value?.name}</span> }));
vi.mock("@/components/shared/EpicPicker", () => ({
  EpicPicker: ({ value, onChange }: { value: { name: string } | null; onChange?: (epic: { key: string; name: string } | null) => void }) => (
    <button data-testid="epic-picker" onClick={() => onChange?.({ key: "EPIC-9", name: "Epic Nine" })}>{value?.name}</button>
  ),
}));

const patchTicketCaches = vi.fn();
const moveTicketSprintCaches = vi.fn();
vi.mock("@/lib/ticket-cache", () => ({
  patchTicketCaches: (...args: unknown[]) => patchTicketCaches(...args),
  moveTicketSprintCaches: (...args: unknown[]) => moveTicketSprintCaches(...args),
}));
vi.mock("@/components/shared/LabelPicker", () => ({ LabelPicker: ({ value }: { value: string[] }) => <span data-testid="label-picker">{value.join(",")}</span> }));
vi.mock("@/components/sprint-board/TicketTable", () => ({ QualityBadge: ({ score }: { score: number | null }) => <span data-testid="quality-badge">{score}</span> }));
vi.mock("@/components/sprint-board/SprintListModal", () => ({
  SprintListModal: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button data-testid="sprint-select" onClick={() => onSelect("2")}>pick sprint</button>
  ),
}));
vi.mock("@/components/ticket-detail/DevPanel", () => ({ DevPanel: () => <div data-testid="dev-panel" /> }));
vi.mock("@/components/ticket-detail/ConfluencePagesSection", () => ({ ConfluencePagesSection: () => <div data-testid="confluence-section" /> }));
vi.mock("@/lib/date-utils", () => ({ relativeDate: () => "14d ago", formatAbsoluteDate: () => "1 Jan 2026" }));
vi.mock("@/components/shared/StatusBadge", () => ({ JIRA_STATUS_COLORS: { "IN PROGRESS": { bg: "#eee", text: "#111" }, "TO DO": { bg: "#eee", text: "#111" } } }));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "PROJ-42",
    title: "Test ticket title",
    type: "story",
    epicKey: null,
    flagged: false,
    jiraStatus: "IN PROGRESS",
    storyPoints: 5,
    businessValue: 3,
    assignee: { name: "Alice", initials: "A", color: "#abc" },
    epic: "Epic One",
    sprintId: "1",
    qualityScore: 85,
    readiness: "drafting",
    poStatus: "Draft",
    editState: "clean",
    notes: "PO notes here",
    ...overrides,
  };
}

const detail: TicketDetail = {
  description: "A description with an acceptance criteria section",
  reporter: { name: "Bob", initials: "B", color: "#123" },
  parent: null,
  labels: ["frontend"],
  components: ["booking"],
  priority: "Medium",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  attachments: [],
  subtasks: [],
  linkedIssues: [],
  jiraComments: [],
  epicChildren: [],
};

describe("TicketMetaContent", () => {
  it("renders story points and business value", () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} />);
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("5");
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("3");
  });

  it("renders the Jira status, assignee, quality badge, confluence and dev panel", () => {
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} />);
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(screen.getByTestId("assignee-picker")).toHaveTextContent("Alice");
    expect(screen.getByTestId("quality-badge")).toBeInTheDocument();
    expect(screen.getByTestId("confluence-section")).toBeInTheDocument();
    expect(screen.getByTestId("dev-panel")).toBeInTheDocument();
  });

  it("reveals readiness controls behind the More details toggle", () => {
    render(<TicketMetaContent ticket={makeTicket({ qualityScore: null })} detail={detail} />);
    fireEvent.click(screen.getByText("More details"));
    expect(screen.getByTestId("readiness-cell")).toBeInTheDocument();
  });

  it("re-syncs sidebar fields when the same ticket is updated in place (e.g. streamed)", () => {
    const { rerender } = render(<TicketMetaContent ticket={makeTicket()} detail={detail} />);
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("5");
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("3");
    expect(screen.getByTestId("assignee-picker")).toHaveTextContent("Alice");

    rerender(
      <TicketMetaContent
        ticket={makeTicket({
          sprintId: "2",
          storyPoints: 13,
          businessValue: 8,
          assignee: { name: "Bob", initials: "B", color: "#123" },
          jiraStatus: "DONE",
        })}
        detail={detail}
      />,
    );

    expect(screen.getByText("Sprint 2")).toBeInTheDocument();
    expect(screen.getByTestId("sp-picker")).toHaveTextContent("13");
    expect(screen.getByTestId("bv-picker")).toHaveTextContent("8");
    expect(screen.getByTestId("assignee-picker")).toHaveTextContent("Bob");
    expect(screen.getByTestId("status-pill")).toHaveTextContent("DONE");
  });

  it("transitions the Jira status and notifies the host", async () => {
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTestId("status-pill"));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/tickets/PROJ-42/status", { method: "PUT", body: { status: "DONE" } });
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("patches the ticket caches immediately when the epic changes, then persists and notifies", async () => {
    patchTicketCaches.mockClear();
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTestId("epic-picker"));
    // Cache patch happens synchronously so the board chip appears at once.
    expect(patchTicketCaches).toHaveBeenCalledWith("PROJ-42", { epic: "Epic Nine", epicKey: "EPIC-9" });
    await waitFor(() => {
      expect(updateEpic).toHaveBeenCalledWith("PROJ-42", "EPIC-9");
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("notifies the host via onMutate after a field edit persists", async () => {
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTestId("sp-picker"));
    await waitFor(() => {
      expect(updateStoryPoints).toHaveBeenCalledWith("PROJ-42", 8);
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("moves the row between sprint caches on sprint change and does not revalidate (avoids the stale row popping back)", async () => {
    moveTicketSprintCaches.mockClear();
    const onMutate = vi.fn();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={onMutate} />);
    fireEvent.click(screen.getByTitle("Sprint: Sprint 1"));
    fireEvent.click(screen.getByTestId("sprint-select"));
    expect(moveTicketSprintCaches).toHaveBeenCalledWith(expect.objectContaining({ key: "PROJ-42" }), "2");
    await waitFor(() => expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["PROJ-42"], targetSprintId: "2" }));
    // No revalidation: relying on the optimistic move keeps the row out of the old list.
    expect(onMutate).not.toHaveBeenCalled();
  });

  it("patches the ticket caches immediately when story points change", async () => {
    patchTicketCaches.mockClear();
    render(<TicketMetaContent ticket={makeTicket()} detail={detail} onMutate={vi.fn()} />);
    fireEvent.click(screen.getByTestId("sp-picker"));
    expect(patchTicketCaches).toHaveBeenCalledWith("PROJ-42", { storyPoints: 8 });
    await waitFor(() => expect(updateStoryPoints).toHaveBeenCalled());
  });
});
