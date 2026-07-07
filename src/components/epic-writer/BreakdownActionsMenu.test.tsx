import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BreakdownActionsMenu } from "./BreakdownActionsMenu";

// The placement drill-in lazy-loads sprints + the default-sprint setting; stub
// them so the menu tests stay off the network.
vi.mock("@/lib/api-client", () => ({
  jira: {
    getSprints: vi.fn().mockResolvedValue([{ id: "42", name: "Sprint 42", state: "active" }]),
  },
  settings: { getDefaultSprint: vi.fn().mockResolvedValue({ sprintId: "" }) },
}));

function base(overrides: Partial<React.ComponentProps<typeof BreakdownActionsMenu>> = {}) {
  return {
    childPlacement: null,
    onSetChildPlacement: vi.fn(),
    onCreateAll: vi.fn(),
    onDeepenAll: vi.fn(),
    onConfirmAll: vi.fn(),
    onLinkExisting: vi.fn(),
    draftCount: 3,
    confirmableCount: 2,
    hasDeepenable: true,
    ...overrides,
  };
}

const open = () => fireEvent.click(screen.getByRole("button", { name: /^actions$/i }));

describe("BreakdownActionsMenu", () => {
  it("keeps everything behind one trigger until opened", () => {
    render(<BreakdownActionsMenu {...base()} />);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    open();
    expect(screen.getByRole("menuitem", { name: /new stories/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /create all in jira/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /deepen all/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /confirm all links/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /link existing/i })).toBeInTheDocument();
  });

  it("shows only the bulk actions that have something to do", () => {
    render(
      <BreakdownActionsMenu
        {...base({ draftCount: 0, confirmableCount: 0, hasDeepenable: false })}
      />,
    );
    open();
    expect(screen.queryByRole("menuitem", { name: /create all in jira/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /deepen all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /confirm all links/i })).not.toBeInTheDocument();
    // Placement + link existing remain available.
    expect(screen.getByRole("menuitem", { name: /new stories/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /link existing/i })).toBeInTheDocument();
  });

  it("runs a bulk action and closes the menu", () => {
    const onCreateAll = vi.fn();
    render(<BreakdownActionsMenu {...base({ onCreateAll })} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /create all in jira/i }));
    expect(onCreateAll).toHaveBeenCalledTimes(1);
    // Menu closes after acting.
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("drills into the placement picker and back", async () => {
    render(<BreakdownActionsMenu {...base()} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /new stories/i }));
    // Placement page: options visible, bulk actions gone.
    expect(await screen.findByRole("menuitem", { name: /to be planned/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /create all in jira/i })).not.toBeInTheDocument();
    // Back returns to the root list.
    fireEvent.click(screen.getByRole("button", { name: /new stories in/i }));
    expect(screen.getByRole("menuitem", { name: /create all in jira/i })).toBeInTheDocument();
  });

  it("chooses a placement and clears it", async () => {
    const onSetChildPlacement = vi.fn();
    const { rerender } = render(
      <BreakdownActionsMenu {...base({ onSetChildPlacement })} />,
    );
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /new stories/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /to be planned/i }));
    expect(onSetChildPlacement).toHaveBeenCalledWith("__backlog__");

    // Once configured, the placement page offers a reset.
    rerender(<BreakdownActionsMenu {...base({ onSetChildPlacement, childPlacement: "__backlog__" })} />);
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /new stories/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /ask each time/i }));
    expect(onSetChildPlacement).toHaveBeenCalledWith(null);
  });

  it("disables the bulk actions while a bulk loop is running", () => {
    render(<BreakdownActionsMenu {...base({ bulkBusy: true })} />);
    open();
    expect(screen.getByRole("menuitem", { name: /create all in jira/i })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /confirm all links/i })).toBeDisabled();
  });
});
