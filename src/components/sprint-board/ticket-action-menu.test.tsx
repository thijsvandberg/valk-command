import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketActionMenuContent, CursorMenu } from "./ticket-action-menu";

// Sub-panels (Epic/Assignee/Label) fetch via SWR; stub so they never hit the network.
vi.mock("swr", () => ({ default: () => ({ data: undefined, mutate: vi.fn() }) }));
// The Epic panel renders the shared EpicPickerBody, which pulls in these.
vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  swrFetcher: vi.fn(),
  ApiError: class ApiError extends Error { status = 500; body = {}; },
}));
vi.mock("@/hooks/useTaskStream", () => ({ useTaskStream: vi.fn() }));

describe("TicketActionMenuContent", () => {
  it("nests the set items under Update; only supplied ones render (BRDG-374)", () => {
    render(
      <TicketActionMenuContent
        onSetStatus={vi.fn()}
        onMoveSprint={vi.fn()}
        sprints={[]}
        close={vi.fn()}
      />,
    );
    // Move is top-level; the set items sit behind "Update".
    expect(screen.getByText("Move to other sprint…")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Update"));
    expect(screen.getByText("Set Status")).toBeInTheDocument();
    expect(screen.queryByText("Set Readiness")).not.toBeInTheDocument();
    expect(screen.queryByText("Update Assignee")).not.toBeInTheDocument();
  });

  it("nests Review/Generate under Assist; Add to refinement stays top-level", () => {
    render(
      <TicketActionMenuContent
        onReviewStory={vi.fn()}
        onGenerateSubtasks={vi.fn()}
        onRefine={vi.fn()}
        close={vi.fn()}
      />,
    );
    expect(screen.getByText("Add to refinement")).toBeInTheDocument();
    expect(screen.getByText("Assist")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Assist"));
    expect(screen.getByText("Review Story")).toBeInTheDocument();
    expect(screen.getByText("Generate Subtasks")).toBeInTheDocument();
  });

  it("invokes the action and closes when an Assist item is clicked", () => {
    const onReviewStory = vi.fn();
    const close = vi.fn();
    render(<TicketActionMenuContent onReviewStory={onReviewStory} close={close} />);
    fireEvent.click(screen.getByText("Assist"));
    fireEvent.click(screen.getByText("Review Story"));
    expect(onReviewStory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  // BRDG-373: the inbox passes onMarkRead; the board / epic children do not.
  it("renders 'Mark as read' only when onMarkRead is supplied, and invokes + closes", () => {
    const { rerender } = render(<TicketActionMenuContent onSetStatus={vi.fn()} close={vi.fn()} />);
    expect(screen.queryByText("Mark as read")).not.toBeInTheDocument();

    const onMarkRead = vi.fn();
    const close = vi.fn();
    rerender(<TicketActionMenuContent onMarkRead={onMarkRead} onSetStatus={vi.fn()} close={close} />);
    fireEvent.click(screen.getByText("Mark as read"));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("renders Move to top/bottom only when their callbacks are supplied", () => {
    const { rerender } = render(<TicketActionMenuContent onSetStatus={vi.fn()} close={vi.fn()} />);
    expect(screen.queryByText("Move to top")).not.toBeInTheDocument();
    expect(screen.queryByText("Move to bottom")).not.toBeInTheDocument();

    rerender(<TicketActionMenuContent onMoveToTop={vi.fn()} onMoveToBottom={vi.fn()} close={vi.fn()} />);
    expect(screen.getByText("Move to top")).toBeInTheDocument();
    expect(screen.getByText("Move to bottom")).toBeInTheDocument();
  });

  it("opens the Epic panel (via Update) without a Back row (it reads like the sidebar)", () => {
    render(<TicketActionMenuContent onSetEpic={vi.fn()} close={vi.fn()} />);
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Set Epic"));
    expect(screen.getByPlaceholderText("Search epics...")).toBeInTheDocument();
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });

  it("shows the AI suggest action in the Epic panel only with a single-target ticket key", () => {
    const { unmount } = render(<TicketActionMenuContent onSetEpic={vi.fn()} close={vi.fn()} />);
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Set Epic"));
    expect(screen.queryByLabelText("Suggest epic with AI")).not.toBeInTheDocument();
    unmount();

    render(<TicketActionMenuContent onSetEpic={vi.fn()} epicSuggestTicketKey="VPL-1" close={vi.fn()} />);
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Set Epic"));
    expect(screen.getByLabelText("Suggest epic with AI")).toBeInTheDocument();
  });

  it("shows a 'Remove epic' action in the Epic panel only when clearable (bulk)", () => {
    const { unmount } = render(<TicketActionMenuContent onSetEpic={vi.fn()} close={vi.fn()} />);
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Set Epic"));
    expect(screen.queryByText("Remove epic")).not.toBeInTheDocument();
    unmount();

    render(<TicketActionMenuContent onSetEpic={vi.fn()} epicClearable close={vi.fn()} />);
    fireEvent.click(screen.getByText("Update"));
    fireEvent.click(screen.getByText("Set Epic"));
    expect(screen.getByText("Remove epic")).toBeInTheDocument();
  });

  it("separates the prominent Move group from the nested Update group with a divider", () => {
    const { container } = render(
      <TicketActionMenuContent
        onSetEpic={vi.fn()}
        onMoveToTop={vi.fn()}
        onMoveToBottom={vi.fn()}
        onUpdateAssignee={vi.fn()}
        close={vi.fn()}
      />,
    );
    // Two clusters at the root: Move (top/bottom) and Update -> one divider between.
    expect(container.querySelectorAll("div.h-px.bg-overlay-strong")).toHaveLength(1);
  });

  it("renders named quick-moves inline with a chip, above the other-sprint picker, and fires onQuickMove (BRDG-369/374)", () => {
    const onQuickMove = vi.fn();
    const close = vi.fn();
    const quickMoves = [
      { id: "active" as const, label: "Move to active sprint", target: "BT: 139", targetSprintId: "2", badge: "active" },
      { id: "next" as const, label: "Move to next sprint", target: "BT: 140", targetSprintId: "3" },
      { id: "backlog" as const, label: "Move to backlog", target: "BT: Backlog", targetSprintId: "9" },
    ];
    const { container } = render(
      <TicketActionMenuContent
        quickMoves={quickMoves}
        onQuickMove={onQuickMove}
        onMoveSprint={vi.fn()}
        sprints={[]}
        close={close}
      />,
    );
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
    const activeIdx = labels.findIndex((t) => t?.startsWith("Move to active"));
    const moreIdx = labels.findIndex((t) => t === "Move to other sprint…");
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(activeIdx).toBeLessThan(moreIdx); // quick moves render above the other-sprint picker
    // The active option shows its destination chip, tagged with the "active" marker.
    expect(screen.getByTitle("active")).toBeInTheDocument();
    expect(screen.getByText("BT: 139")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Move to next sprint"));
    expect(onQuickMove).toHaveBeenCalledWith(quickMoves[1]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("the other-sprint picker leads with Backlog + Overall refinement and drops what's offered above (BRDG-374)", () => {
    const sprints = [
      { id: "act", name: "BT: 140", state: "active" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
      { id: "next", name: "BT: 141", state: "future" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
      { id: "cur", name: "BT: 143", state: "future" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
      { id: "other", name: "BT: 142", state: "future" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
      { id: "other2", name: "BT: 144", state: "future" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
      { id: "todo", name: "BT: TODO", state: "future" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
      { id: "nbl", name: "BT: Backlog", state: "backlog" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
      { id: "ovr", name: "Overall refinement", state: "future" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
    ];
    // active + next are offered as quick-moves one level up; "cur" is the selection's sprint.
    const quickMoves = [
      { id: "active" as const, label: "Move to active sprint", target: "BT: 140", targetSprintId: "act", badge: "active" },
      { id: "next" as const, label: "Move to next sprint", target: "BT: 141", targetSprintId: "next" },
    ];
    const { container } = render(
      <TicketActionMenuContent
        quickMoves={quickMoves}
        onQuickMove={vi.fn()}
        onMoveSprint={vi.fn()}
        sprints={sprints}
        currentSprintIds={["cur"]}
        initialView="move"
        close={vi.fn()}
      />,
    );
    // Top buckets present.
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Overall refinement")).toBeInTheDocument();
    // A plain remaining sprint stays.
    expect(screen.getByText("BT: 142")).toBeInTheDocument();
    // The named backlog and the current sprint are dropped from the list entirely.
    expect(screen.queryByText("BT: Backlog")).not.toBeInTheDocument();
    expect(screen.queryByText("BT: 143")).not.toBeInTheDocument();
    // active / next appear ONLY as the quick-move chips above, never again in the list.
    expect(screen.getAllByText("BT: 140")).toHaveLength(1);
    expect(screen.getAllByText("BT: 141")).toHaveLength(1);
    // Remaining sprints sort by number ascending within the team; "TODO" (no number) last.
    // Sprint rows are div[role=button] (they nest the top/bottom icon buttons, BRDG-362).
    const labels = Array.from(container.querySelectorAll("[role='button']"))
      .map((b) => b.querySelector("span.truncate")?.textContent ?? b.textContent);
    expect(labels.indexOf("BT: 142")).toBeLessThan(labels.indexOf("BT: 144"));
    expect(labels.indexOf("BT: 144")).toBeLessThan(labels.indexOf("BT: TODO"));
  });

  it("the other-sprint picker's top/bottom buttons pass the position to onMoveSprint (BRDG-362)", () => {
    const onMoveSprint = vi.fn();
    const close = vi.fn();
    render(
      <TicketActionMenuContent
        onMoveSprint={onMoveSprint}
        sprints={[{ id: "s1", name: "BT: 142", state: "future" as const, dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null }]}
        initialView="move"
        close={close}
      />,
    );
    fireEvent.click(screen.getByTitle("Move to top of sprint"));
    expect(onMoveSprint).toHaveBeenCalledWith("s1", "top");
    expect(close).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Move to bottom of sprint"));
    expect(onMoveSprint).toHaveBeenCalledWith("s1", "bottom");

    fireEvent.click(screen.getByText("BT: 142"));
    expect(onMoveSprint).toHaveBeenCalledWith("s1", undefined);
  });

  it("Add to refinement shows each session's ticket count (BRDG-374)", () => {
    render(
      <TicketActionMenuContent
        refinements={[{ id: "s1", name: "24 Jun 2026", count: 6 }]}
        onAddToRefinement={vi.fn()}
        close={vi.fn()}
      />,
    );
    expect(screen.getByText("24 Jun 2026")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("renders no quick-move items when none are supplied", () => {
    render(<TicketActionMenuContent onMoveSprint={vi.fn()} sprints={[]} close={vi.fn()} />);
    expect(screen.queryByText("Move to active sprint")).not.toBeInTheDocument();
    expect(screen.queryByText("Move to next sprint")).not.toBeInTheDocument();
    expect(screen.getByText("Move to other sprint…")).toBeInTheDocument();
  });

  it("fires Move to top / Move to bottom and closes", () => {
    const onMoveToTop = vi.fn();
    const onMoveToBottom = vi.fn();
    const close = vi.fn();
    render(<TicketActionMenuContent onMoveToTop={onMoveToTop} onMoveToBottom={onMoveToBottom} close={close} />);
    fireEvent.click(screen.getByText("Move to top"));
    expect(onMoveToTop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Move to bottom"));
    expect(onMoveToBottom).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("opens a group view directly via initialView (used by the bar's icon dropdowns)", () => {
    render(<TicketActionMenuContent onSetStatus={vi.fn()} onSetReadiness={vi.fn()} initialView="update" close={vi.fn()} />);
    // No "Update" wrapper item; the set items show immediately, with no Back at the root view.
    expect(screen.getByText("Set Status")).toBeInTheDocument();
    expect(screen.getByText("Set Readiness")).toBeInTheDocument();
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });

  it("carries the flag toggle inside the Update view (bar dropdown)", () => {
    const onSetFlagged = vi.fn();
    render(
      <TicketActionMenuContent
        onSetStatus={vi.fn()}
        onSetFlagged={onSetFlagged}
        flagState="unflagged"
        initialView="update"
        close={vi.fn()}
      />,
    );
    expect(screen.getByText("Set Status")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Flag"));
    expect(onSetFlagged).toHaveBeenCalledWith(true);
  });

  describe("flag items follow flagState", () => {
    it("shows only Flag when all targets are unflagged", () => {
      render(<TicketActionMenuContent onSetFlagged={vi.fn()} flagState="unflagged" close={vi.fn()} />);
      expect(screen.getByText("Flag")).toBeInTheDocument();
      expect(screen.queryByText("Remove flag")).not.toBeInTheDocument();
    });

    it("shows only Remove flag when all targets are flagged", () => {
      render(<TicketActionMenuContent onSetFlagged={vi.fn()} flagState="flagged" close={vi.fn()} />);
      expect(screen.getByText("Remove flag")).toBeInTheDocument();
      expect(screen.queryByText("Flag")).not.toBeInTheDocument();
    });

    it("Remove flag keeps the flag's pole (stroke drawn, not strokeWidth 0) (BRDG-374)", () => {
      render(<TicketActionMenuContent onSetFlagged={vi.fn()} flagState="flagged" close={vi.fn()} />);
      const svg = screen.getByText("Remove flag").closest("button")!.querySelector("svg")!;
      // strokeWidth 0 would hide the pole, leaving only the filled banner.
      expect(svg.getAttribute("stroke-width")).not.toBe("0");
    });

    it("shows both for a mixed selection", () => {
      render(<TicketActionMenuContent onSetFlagged={vi.fn()} flagState="mixed" close={vi.fn()} />);
      expect(screen.getByText("Flag")).toBeInTheDocument();
      expect(screen.getByText("Remove flag")).toBeInTheDocument();
    });

    it("does not render flag items when onSetFlagged is absent", () => {
      render(<TicketActionMenuContent onSetStatus={vi.fn()} close={vi.fn()} />);
      expect(screen.queryByText("Flag")).not.toBeInTheDocument();
      expect(screen.queryByText("Remove flag")).not.toBeInTheDocument();
    });

    it("calls onSetFlagged(true) and closes when Flag is clicked", () => {
      const onSetFlagged = vi.fn();
      const close = vi.fn();
      render(<TicketActionMenuContent onSetFlagged={onSetFlagged} flagState="unflagged" close={close} />);
      fireEvent.click(screen.getByText("Flag"));
      expect(onSetFlagged).toHaveBeenCalledWith(true);
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  it("reveals Update's Set Status options in a hover flyout (no Back)", () => {
    render(<TicketActionMenuContent onSetStatus={vi.fn()} close={vi.fn()} />);
    expect(screen.getByText("Update")).toBeInTheDocument();
    // The Set Status flyout and its options live in the DOM (shown on hover) - no Back row.
    expect(screen.getByText("Set Status")).toBeInTheDocument();
    expect(screen.getByText("TO DO")).toBeInTheDocument();
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });
});

describe("CursorMenu", () => {
  it("renders its children at the cursor position", () => {
    render(
      <CursorMenu x={100} y={120} onClose={vi.fn()}>
        <div>Menu body</div>
      </CursorMenu>,
    );
    expect(screen.getByText("Menu body")).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <CursorMenu x={10} y={10} onClose={onClose}>
        <div>Menu body</div>
      </CursorMenu>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on an outside mousedown", () => {
    const onClose = vi.fn();
    render(
      <div>
        <button>outside</button>
        <CursorMenu x={10} y={10} onClose={onClose}>
          <div>Menu body</div>
        </CursorMenu>
      </div>,
    );
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(onClose).toHaveBeenCalled();
  });
});
