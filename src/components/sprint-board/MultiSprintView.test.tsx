import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
import { MultiSprintView } from "./MultiSprintView";
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
  return { key, title: key, type: "Story", jiraStatus: "TO DO" } as Ticket;
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
    jiraMock.rank.mockClear();
    jiraMock.moveSprint.mockClear();
    mutateLeft.mockClear();
    mutateRight.mockClear();
    dnd.onDragEnd = undefined;
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
});
