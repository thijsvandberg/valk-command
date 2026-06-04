import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EpicChildrenBySprint } from "./EpicChildrenBySprint";
import type { EpicChild, Sprint } from "@/types/ticket";

// The Epic/Assignee/Label sub-panels fetch via SWR; stub so they never hit the network.
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
// Avoid the hover-data SWR read inside the real status pill.
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="pill">{ticketKey}</span>,
}));

const SPRINTS: Sprint[] = [
  { id: "1", name: "Sprint 1", dateRange: "", state: "active", ticketCount: 0, startDate: "2026-06-01", endDate: null, goal: null },
  { id: "2", name: "Sprint 2", dateRange: "", state: "future", ticketCount: 0, startDate: "2026-07-01", endDate: null, goal: null },
  // Sprint 3 has no children below, so it never renders as a group, only in the menu.
  { id: "3", name: "Sprint 3", dateRange: "", state: "future", ticketCount: 0, startDate: "2026-08-01", endDate: null, goal: null },
  { id: "9", name: "Old Sprint", dateRange: "", state: "closed", ticketCount: 0, startDate: "2026-05-01", endDate: null, goal: null },
];

function child(key: string, sprintName: string | null): EpicChild {
  return {
    key,
    title: `Title ${key}`,
    type: "story",
    jiraStatus: "TO DO",
    assignee: null,
    storyPoints: null,
    businessValue: null,
    sprintName,
    subtaskCount: 0,
    readiness: null,
    jiraRank: null,
  };
}

function setup(overrides: Partial<Parameters<typeof EpicChildrenBySprint>[0]> = {}) {
  const onMoveChild = vi.fn();
  const onMoveError = vi.fn();
  const onRowContextMenu = vi.fn();
  render(
    <EpicChildrenBySprint
      items={[child("VPL-10", "Sprint 1"), child("VPL-11", "Sprint 2")]}
      sprints={SPRINTS}
      ticketKey="VPL-1"
      visibleFields={new Set(["issueKey", "status"])}
      renderMetadata={() => null}
      onJiraStatusChange={vi.fn()}
      onReadinessChange={vi.fn()}
      onMoveChild={onMoveChild}
      onRowContextMenu={onRowContextMenu}
      onMoveError={onMoveError}
      {...overrides}
    />,
  );
  return { onMoveChild, onMoveError, onRowContextMenu };
}

// The action menu itself is rendered by the parent (EpicChildrenSection); here we
// only verify that right-clicking a row delegates the row key to onRowContextMenu.
describe("EpicChildrenBySprint row context menu", () => {
  it("renders a group per occupied sprint and no group for empty sprints", () => {
    setup();
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getByText("Sprint 2")).toBeInTheDocument();
    // Sprint 3 has no children, so it is not a group header.
    expect(screen.queryByText("Sprint 3")).not.toBeInTheDocument();
  });

  it("delegates a right-click to onRowContextMenu with the row key", () => {
    const { onRowContextMenu } = setup();
    fireEvent.contextMenu(screen.getByText("Title VPL-10"));
    expect(onRowContextMenu).toHaveBeenCalledTimes(1);
    expect(onRowContextMenu.mock.calls[0][0]).toBe("VPL-10");
  });

  it("does not open the context menu on a pending row", () => {
    const { onRowContextMenu } = setup({
      items: [{ key: "pending-1", title: "Pending row", type: "task", jiraStatus: "TO DO", assignee: null }],
    });
    fireEvent.contextMenu(screen.getByText("Pending row"));
    expect(onRowContextMenu).not.toHaveBeenCalled();
  });

  it("suppresses the context menu while a keyboard drag is active", () => {
    const { onRowContextMenu } = setup();
    const handle = screen.getByLabelText("Drag VPL-10 to reorder or move it to another sprint");
    handle.focus();
    // Space picks up the draggable via dnd-kit's KeyboardSensor (sets the drag flag).
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    // The pickup mirrors the title into the DragOverlay, so target the original row.
    fireEvent.contextMenu(screen.getAllByText("Title VPL-10")[0]);
    expect(onRowContextMenu).not.toHaveBeenCalled();
  });

  it("renders nothing without children", () => {
    const { container } = render(
      <EpicChildrenBySprint
        items={[]}
        sprints={SPRINTS}
        ticketKey="VPL-1"
        visibleFields={new Set()}
        renderMetadata={() => null}
        onJiraStatusChange={vi.fn()}
        onReadinessChange={vi.fn()}
        onMoveChild={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EpicChildrenBySprint inline create", () => {
  function setupCreate(overrides: Partial<Parameters<typeof EpicChildrenBySprint>[0]> = {}) {
    const onCreateChild = vi.fn();
    render(
      <EpicChildrenBySprint
        items={[
          child("VPL-10", "Sprint 1"),
          child("VPL-11", "Sprint 2"),
          child("VPL-90", "Old Sprint"),
          child("VPL-99", null),
        ]}
        sprints={SPRINTS}
        ticketKey="VPL-1"
        visibleFields={new Set(["issueKey", "status"])}
        renderMetadata={() => null}
        onJiraStatusChange={vi.fn()}
        onReadinessChange={vi.fn()}
        onCreateChild={onCreateChild}
        {...overrides}
      />,
    );
    return { onCreateChild };
  }

  it("shows a create button on active, future and unscheduled groups but not closed ones", () => {
    setupCreate();
    expect(screen.getByLabelText("Create issue in Sprint 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Create issue in Sprint 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Create issue in Unscheduled")).toBeInTheDocument();
    expect(screen.queryByLabelText("Create issue in Old Sprint")).not.toBeInTheDocument();
  });

  it("does not render a create button without onCreateChild", () => {
    setupCreate({ onCreateChild: undefined });
    expect(screen.queryByLabelText("Create issue in Sprint 1")).not.toBeInTheDocument();
  });

  it("opens an inline composer for the clicked group", () => {
    setupCreate();
    fireEvent.click(screen.getByLabelText("Create issue in Sprint 1"));
    expect(screen.getByPlaceholderText("Create issue in Sprint 1...")).toBeInTheDocument();
  });

  it("keeps only one composer open at a time", () => {
    setupCreate();
    fireEvent.click(screen.getByLabelText("Create issue in Sprint 1"));
    fireEvent.click(screen.getByLabelText("Create issue in Sprint 2"));
    expect(screen.queryByPlaceholderText("Create issue in Sprint 1...")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Create issue in Sprint 2...")).toBeInTheDocument();
  });

  it("toggles the composer closed when its button is clicked again", () => {
    setupCreate();
    const btn = screen.getByLabelText("Create issue in Sprint 1");
    fireEvent.click(btn);
    expect(screen.getByPlaceholderText("Create issue in Sprint 1...")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByPlaceholderText("Create issue in Sprint 1...")).not.toBeInTheDocument();
  });

  it("creates into the resolved sprint id on Enter", () => {
    const { onCreateChild } = setupCreate();
    fireEvent.click(screen.getByLabelText("Create issue in Sprint 1"));
    const input = screen.getByPlaceholderText("Create issue in Sprint 1...");
    fireEvent.change(input, { target: { value: "New thing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreateChild).toHaveBeenCalledWith(
      { sprintId: "1", sprintName: "Sprint 1" },
      "New thing",
      "Story",
    );
  });

  it("creates with no sprint from the Unscheduled group", () => {
    const { onCreateChild } = setupCreate();
    fireEvent.click(screen.getByLabelText("Create issue in Unscheduled"));
    const input = screen.getByPlaceholderText("Create unscheduled issue...");
    fireEvent.change(input, { target: { value: "Loose item" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreateChild).toHaveBeenCalledWith(
      { sprintId: null, sprintName: null },
      "Loose item",
      "Story",
    );
  });

  it("closes the composer on Escape when empty", () => {
    setupCreate();
    fireEvent.click(screen.getByLabelText("Create issue in Sprint 1"));
    const input = screen.getByPlaceholderText("Create issue in Sprint 1...");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Create issue in Sprint 1...")).not.toBeInTheDocument();
  });

  it("keeps the composer open after creating for rapid entry", () => {
    const { onCreateChild } = setupCreate();
    fireEvent.click(screen.getByLabelText("Create issue in Sprint 1"));
    const input = screen.getByPlaceholderText("Create issue in Sprint 1...");
    fireEvent.change(input, { target: { value: "First" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreateChild).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("Create issue in Sprint 1...")).toHaveValue("");
  });
});
