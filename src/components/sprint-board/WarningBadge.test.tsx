import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WarningBadge } from "./WarningBadge";
import type { Ticket } from "@/types/ticket";

// Isolate the badge behaviour from the popover/modal internals.
vi.mock("./OpenSubtasksIndicator", () => ({
  IndicatorPopover: () => <div data-testid="subtask-popover" />,
}));
vi.mock("./AddSubtasksModal", () => ({
  AddSubtasksModal: ({ open, onCreated }: { open: boolean; onCreated: (n: number) => void }) =>
    open ? (
      <div data-testid="add-modal">
        <button data-testid="simulate-create" onClick={() => onCreated(2)}>create</button>
      </div>
    ) : null,
}));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "T",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "DONE",
    storyPoints: 3,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    openSubtaskCount: 2,
    totalSubtaskCount: 5,
    ...overrides,
  } as Ticket;
}

describe("WarningBadge (BRDG-366)", () => {
  it("renders a static, non-interactive chip for non-actionable kinds", () => {
    render(<WarningBadge kind="unpointed" ticket={makeTicket()} />);
    expect(screen.getByText("No story point estimate")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens the add-subtasks modal from the 'No subtasks' badge and reports created count", () => {
    const onSubtasksAdded = vi.fn();
    render(
      <WarningBadge kind="no_subtasks" ticket={makeTicket({ jiraStatus: "TO DO", totalSubtaskCount: 0 })} onSubtasksAdded={onSubtasksAdded} />,
    );

    expect(screen.queryByTestId("add-modal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /no subtasks/i }));
    expect(screen.getByTestId("add-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("simulate-create"));
    expect(onSubtasksAdded).toHaveBeenCalledWith("VPL-1", 2);
  });

  it("falls back to a static chip for 'No subtasks' when no add handler is wired", () => {
    render(<WarningBadge kind="no_subtasks" ticket={makeTicket({ jiraStatus: "TO DO", totalSubtaskCount: 0 })} />);
    expect(screen.getByText("No subtasks")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("toggles the subtask popover from the 'Closed with open subtasks' badge", () => {
    render(<WarningBadge kind="closed_with_open_subtasks" ticket={makeTicket()} onCloseSubtasks={vi.fn()} />);
    expect(screen.queryByTestId("subtask-popover")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /closed with open subtasks/i }));
    expect(screen.getByTestId("subtask-popover")).toBeInTheDocument();
  });
});
