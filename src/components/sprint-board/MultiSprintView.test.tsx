import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
import { MultiSprintView } from "./MultiSprintView";
import { __resetPendingEdits } from "./pendingTicketEdits";
import type { Ticket, Sprint } from "@/types/ticket";

// Capture the DnD callbacks MultiSprintView wires so the test can drive a drag
// without simulating pointer physics. The reorder / cross-column move logic lives
// in MultiSprintView.handleDragEnd, which is what BRDG-388 must preserve.
const dnd: { onDragEnd?: (e: DragEndEvent) => void } = {};
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (e: DragEndEvent) => void }) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  pointerWithin: () => [],
}));

// Stub the column so we exercise MultiSprintView, not BoardRow's subtree. Capture
// props to assert the legacy column-config props are gone (Option 2).
const columnProps: Record<string, unknown>[] = [];
vi.mock("./DroppableSprintColumn", () => ({
  DroppableSprintColumn: (props: Record<string, unknown>) => {
    columnProps.push(props);
    return <div data-testid={`col-${props.columnId}`} />;
  },
  PaneDivider: () => <div data-testid="pane-divider" />,
}));

vi.mock("./SidePanel", () => ({ SidePanel: () => <div data-testid="side-panel" /> }));
vi.mock("./BulkActionBar", () => ({ BulkActionBar: () => <div data-testid="bulk-bar" /> }));

// Capture the field-toggle wiring so the test can flip a badge and assert the
// setting write, without rendering the real popover.
const fieldToggleProps: Record<string, unknown>[] = [];
vi.mock("./BoardFieldToggle", () => ({
  BoardFieldToggle: (props: Record<string, unknown>) => {
    fieldToggleProps.push(props);
    const onChange = props.onChange as (id: string, show: boolean) => void;
    return <button data-testid="field-toggle" onClick={() => onChange("assignee", false)}>fields</button>;
  },
}));

const setStoredTags = vi.fn();
vi.mock("@/hooks/useAccountSetting", () => ({
  useAccountSetting: () => ({ value: ["storyPoints", "epic", "assignee"], setValue: setStoredTags, isLoading: false }),
}));
vi.mock("./TicketTableCells", () => ({ getJiraUrl: (k: string) => `https://jira/${k}` }));
vi.mock("@/components/shared/IssueTypeIcon", () => ({ IssueTypeIcon: () => <span data-testid="type-icon" /> }));
vi.mock("@/components/ui/Toast", () => ({ Toast: () => null }));
vi.mock("@/components/ui/Button", () => ({ Button: (p: Record<string, unknown>) => <button {...p} /> }));
vi.mock("@/components/shared/ViewHeader", () => ({
  ViewHeader: ({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) => (
    <div>{children}{actions}</div>
  ),
  ViewHeaderTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  ViewHeaderDivider: () => <span />,
}));
vi.mock("./sprint-board-utils", () => ({ saveTicketMetadata: vi.fn(), saveStoryPoints: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: null, toastLoading: false, showToast: vi.fn(), dismissToast: vi.fn() }),
}));
vi.mock("@/hooks/useTicketSessionMap", () => ({ useTicketSessionMap: () => ({ ticketSessionMap: new Map() }) }));
vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return { X: stub("x"), Columns2: stub("columns") };
});

const jiraMock = { rank: vi.fn().mockResolvedValue(undefined), moveSprint: vi.fn().mockResolvedValue(undefined), syncTickets: vi.fn().mockResolvedValue(undefined) };
vi.mock("@/lib/api-client", () => ({
  jira: { rank: (...a: unknown[]) => jiraMock.rank(...a), moveSprint: (...a: unknown[]) => jiraMock.moveSprint(...a), syncTickets: (...a: unknown[]) => jiraMock.syncTickets(...a) },
  apiFetch: vi.fn().mockResolvedValue(undefined),
}));

const mutateLeft = vi.fn().mockResolvedValue(undefined);
const mutateRight = vi.fn().mockResolvedValue(undefined);
function makeTicket(key: string): Ticket {
  return { key, title: key, type: "Story", jiraStatus: "TO DO" } as unknown as Ticket;
}
vi.mock("@/hooks/useSprintBoard", () => ({
  useTickets: (sprintId: string) =>
    sprintId === "s1"
      ? { data: [makeTicket("K-0"), makeTicket("K-1"), makeTicket("K-2")], mutate: mutateLeft }
      : { data: [makeTicket("R-0")], mutate: mutateRight },
}));

const sprints: Sprint[] = [
  { id: "s1", name: "Sprint 1", state: "active" } as Sprint,
  { id: "s2", name: "Sprint 2", state: "future" } as Sprint,
];

function renderView() {
  return render(
    <MultiSprintView initialLeft="s1" initialRight="s2" sprints={sprints} onClose={vi.fn()} />,
  );
}

describe("MultiSprintView (BRDG-388 BoardRow migration)", () => {
  beforeEach(() => {
    columnProps.length = 0;
    fieldToggleProps.length = 0;
    jiraMock.rank.mockClear();
    jiraMock.moveSprint.mockClear();
    mutateLeft.mockClear();
    mutateRight.mockClear();
    setStoredTags.mockClear();
    jiraMock.syncTickets.mockClear();
    dnd.onDragEnd = undefined;
    __resetPendingEdits();
  });

  it("renders both sprint columns", () => {
    renderView();
    expect(screen.getByTestId("col-left")).toBeInTheDocument();
    expect(screen.getByTestId("col-right")).toBeInTheDocument();
  });

  it("no longer passes the legacy column-config props to the columns", () => {
    renderView();
    const left = columnProps.find((p) => p.columnId === "left")!;
    expect(left).not.toHaveProperty("visibleColumns");
    expect(left).not.toHaveProperty("columnOrder");
    expect(left).not.toHaveProperty("columnWidths");
    expect(left).not.toHaveProperty("onToggleAll");
  });

  it("passes the stored badge set to both columns as visibleTags", () => {
    renderView();
    const left = columnProps.find((p) => p.columnId === "left")!;
    const right = columnProps.find((p) => p.columnId === "right")!;
    expect(left.visibleTags).toBeInstanceOf(Set);
    expect((left.visibleTags as Set<string>).has("storyPoints")).toBe(true);
    expect((right.visibleTags as Set<string>).has("epic")).toBe(true);
  });

  it("persists a badge toggle via the Compare-specific setting", () => {
    renderView();
    screen.getByTestId("field-toggle").click();
    expect(setStoredTags).toHaveBeenCalledTimes(1);
    // The updater removes "assignee" from the prior set.
    const updater = setStoredTags.mock.calls[0][0] as (prev: string[]) => string[];
    expect(updater(["storyPoints", "epic", "assignee"])).toEqual(["storyPoints", "epic"]);
  });

  it("ranks within a column when a row is dropped onto a sibling", async () => {
    renderView();
    await act(async () => {
      await dnd.onDragEnd!({
        active: { id: "K-0", data: { current: { columnId: "left" } } },
        over: { id: "K-2", data: { current: { columnId: "left" } } },
      } as unknown as DragEndEvent);
    });
    expect(jiraMock.rank).toHaveBeenCalledTimes(1);
    expect(jiraMock.rank).toHaveBeenCalledWith(
      expect.objectContaining({ issueKeys: ["K-0"] }),
    );
    expect(jiraMock.moveSprint).not.toHaveBeenCalled();
  });

  it("moves across sprints when dropped on the other column", async () => {
    renderView();
    await act(async () => {
      await dnd.onDragEnd!({
        active: { id: "K-0", data: { current: { columnId: "left" } } },
        over: { id: "right", data: { current: {} } },
      } as unknown as DragEndEvent);
    });
    expect(jiraMock.moveSprint).toHaveBeenCalledTimes(1);
    expect(jiraMock.moveSprint).toHaveBeenCalledWith(
      expect.objectContaining({ issueKeys: ["K-0"], targetSprintId: "s2" }),
    );
  });

  // --- BRDG-407: optimistic overlay (no snap-back) ---

  const leftTicketsNow = () => columnProps.filter((p) => p.columnId === "left").at(-1)!.tickets as Ticket[];
  const rightTicketsNow = () => columnProps.filter((p) => p.columnId === "right").at(-1)!.tickets as Ticket[];

  it("keeps a status edit after a revalidation (overlay, no snap-back)", async () => {
    const { rerender } = renderView();
    const onJiraStatusChange = columnProps.find((p) => p.columnId === "left")!.onJiraStatusChange as (k: string, s: string) => Promise<void>;

    await act(async () => {
      await onJiraStatusChange("K-0", "DONE");
    });

    // The overlay drives the displayed status immediately...
    expect(leftTicketsNow().find((t) => t.key === "K-0")?.jiraStatus).toBe("DONE");

    // ...and a revalidation that returns the pre-edit base data does NOT snap it back.
    rerender(<MultiSprintView initialLeft="s1" initialRight="s2" sprints={sprints} onClose={vi.fn()} />);
    expect(leftTicketsNow().find((t) => t.key === "K-0")?.jiraStatus).toBe("DONE");
  });

  it("keeps a title edit after a revalidation", async () => {
    const { rerender } = renderView();
    const onTitleChange = columnProps.find((p) => p.columnId === "left")!.onTitleChange as (k: string, t: string) => Promise<void>;

    await act(async () => {
      await onTitleChange("K-1", "Renamed");
    });
    expect(leftTicketsNow().find((t) => t.key === "K-1")?.title).toBe("Renamed");

    rerender(<MultiSprintView initialLeft="s1" initialRight="s2" sprints={sprints} onClose={vi.fn()} />);
    expect(leftTicketsNow().find((t) => t.key === "K-1")?.title).toBe("Renamed");
  });

  it("keeps a cross-column move through a revalidation (override held, not dropped)", async () => {
    jiraMock.moveSprint.mockResolvedValue(undefined);
    const { rerender } = renderView();

    await act(async () => {
      await dnd.onDragEnd!({
        active: { id: "K-0", data: { current: { columnId: "left" } } },
        over: { id: "right", data: { current: {} } },
      } as unknown as DragEndEvent);
    });

    // Optimistic move applied: K-0 left the left column, joined the right.
    expect(leftTicketsNow().some((t) => t.key === "K-0")).toBe(false);
    expect(rightTicketsNow().some((t) => t.key === "K-0")).toBe(true);

    // A revalidation returning the pre-move base must not revert it (the override is
    // held until its TTL rather than dropped immediately after the write).
    rerender(<MultiSprintView initialLeft="s1" initialRight="s2" sprints={sprints} onClose={vi.fn()} />);
    expect(leftTicketsNow().some((t) => t.key === "K-0")).toBe(false);
    expect(rightTicketsNow().some((t) => t.key === "K-0")).toBe(true);
  });

  it("reverts a cross-column move when the server write fails", async () => {
    jiraMock.moveSprint.mockRejectedValueOnce(new Error("move failed"));
    renderView();

    await act(async () => {
      await dnd.onDragEnd!({
        active: { id: "K-0", data: { current: { columnId: "left" } } },
        over: { id: "right", data: { current: {} } },
      } as unknown as DragEndEvent);
    });

    // The move failed: K-0 is back in the left column.
    expect(leftTicketsNow().some((t) => t.key === "K-0")).toBe(true);
    expect(rightTicketsNow().some((t) => t.key === "K-0")).toBe(false);
  });
});
