import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketActionMenuContent, CursorMenu } from "./ticket-action-menu";

// Sub-panels (Epic/Assignee/Label) fetch via SWR; stub so they never hit the network.
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));

describe("TicketActionMenuContent", () => {
  it("renders only the update items whose callbacks are supplied", () => {
    render(
      <TicketActionMenuContent
        onSetStatus={vi.fn()}
        onMoveSprint={vi.fn()}
        sprints={[]}
        close={vi.fn()}
      />,
    );
    expect(screen.getByText("Set Status")).toBeInTheDocument();
    expect(screen.getByText("Move to Sprint")).toBeInTheDocument();
    expect(screen.queryByText("Set Readiness")).not.toBeInTheDocument();
    expect(screen.queryByText("Update Assignee")).not.toBeInTheDocument();
  });

  it("renders direct-action items (review, subtasks, refine) when supplied", () => {
    render(
      <TicketActionMenuContent
        onReviewStory={vi.fn()}
        onGenerateSubtasks={vi.fn()}
        onRefine={vi.fn()}
        close={vi.fn()}
      />,
    );
    expect(screen.getByText("Review Story")).toBeInTheDocument();
    expect(screen.getByText("Generate Subtasks")).toBeInTheDocument();
    expect(screen.getByText("Add to Refinement")).toBeInTheDocument();
  });

  it("invokes the action and closes when an item is clicked", () => {
    const onReviewStory = vi.fn();
    const close = vi.fn();
    render(<TicketActionMenuContent onReviewStory={onReviewStory} close={close} />);
    fireEvent.click(screen.getByText("Review Story"));
    expect(onReviewStory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
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

  it("renders the header label (target ticket key) at the top of the menu", () => {
    render(<TicketActionMenuContent header="VPL-1337" onSetStatus={vi.fn()} close={vi.fn()} />);
    expect(screen.getByText("VPL-1337")).toBeInTheDocument();
  });

  it("navigates into the Set Status sub-panel and back", () => {
    render(<TicketActionMenuContent onSetStatus={vi.fn()} close={vi.fn()} />);
    fireEvent.click(screen.getByText("Set Status"));
    expect(screen.getByText("Back")).toBeInTheDocument();
    // Status options are now visible
    expect(screen.getByText("TO DO")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Set Status")).toBeInTheDocument();
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
