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
  };
}

function setup(overrides: Partial<Parameters<typeof EpicChildrenBySprint>[0]> = {}) {
  const onMoveChild = vi.fn();
  const onMoveError = vi.fn();
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
      onMoveError={onMoveError}
      {...overrides}
    />,
  );
  return { onMoveChild, onMoveError };
}

function openRowMenu(key: string) {
  fireEvent.contextMenu(screen.getByText(`Title ${key}`));
  fireEvent.click(screen.getByText("Move to Sprint"));
}

describe("EpicChildrenBySprint move actions", () => {
  it("renders a group per occupied sprint and no group for empty sprints", () => {
    setup();
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getByText("Sprint 2")).toBeInTheDocument();
    // Sprint 3 has no children, so it is not a group header.
    expect(screen.queryByText("Sprint 3")).not.toBeInTheDocument();
  });

  it("opens the move menu on right-click and moves into a sprint that has no current children", () => {
    const { onMoveChild } = setup();
    openRowMenu("VPL-10");
    // Sprint 3 only exists in the searchable menu (no group on screen).
    fireEvent.click(screen.getByText("Sprint 3"));
    expect(onMoveChild).toHaveBeenCalledWith("VPL-10", "3");
  });

  it("moves a child to the backlog via the menu", () => {
    const { onMoveChild } = setup();
    openRowMenu("VPL-11");
    fireEvent.click(screen.getByText("Backlog"));
    expect(onMoveChild).toHaveBeenCalledWith("VPL-11", "__backlog__");
  });

  it("only offers active/future sprints in the menu (closed sprints excluded)", () => {
    setup();
    fireEvent.contextMenu(screen.getByText("Title VPL-10"));
    fireEvent.click(screen.getByText("Move to Sprint"));
    expect(screen.queryByText("Old Sprint")).not.toBeInTheDocument();
  });

  it("does not open the move menu on a pending row", () => {
    setup({ items: [{ key: "pending-1", title: "Pending row", type: "task", jiraStatus: "TO DO", assignee: null }] });
    fireEvent.contextMenu(screen.getByText("Pending row"));
    expect(screen.queryByText("Move to Sprint")).not.toBeInTheDocument();
  });

  it("suppresses the context menu while a keyboard drag is active", () => {
    setup();
    const handle = screen.getByLabelText("Move VPL-10 to another sprint");
    handle.focus();
    // Space picks up the draggable via dnd-kit's KeyboardSensor (sets the drag flag).
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    // The pickup mirrors the title into the DragOverlay, so target the original row.
    fireEvent.contextMenu(screen.getAllByText("Title VPL-10")[0]);
    expect(screen.queryByText("Move to Sprint")).not.toBeInTheDocument();
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
