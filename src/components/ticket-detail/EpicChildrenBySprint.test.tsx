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

// Forward-planning placeholders (BRDG-304) in the epic-by-sprint view.
describe("EpicChildrenBySprint placeholders", () => {
  const PLACEHOLDER = {
    id: "PLH-1",
    title: "Penciled work",
    description: "",
    type: "story" as const,
    sprintId: "1",
    sprintName: "Sprint 1",
    epicKey: "VPL-1",
    epic: null,
    businessValue: null,
    guestimation: 5,
    status: "active" as const,
    promotedToKey: null,
    createdAt: "2026-06-10T00:00:00Z",
    updatedAt: "2026-06-10T00:00:00Z",
  };

  it("renders a placeholder in its sprint group when planning mode is on", () => {
    setup({ placeholders: [PLACEHOLDER], planningOn: true, onPlaceholderUpdate: vi.fn(), onPlaceholderPromote: vi.fn(), onPlaceholderDelete: vi.fn() });
    expect(screen.getByText("Penciled work")).toBeInTheDocument();
    expect(screen.getByText("Placeholder")).toBeInTheDocument();
  });

  it("hides placeholders when planning mode is off", () => {
    setup({ placeholders: [PLACEHOLDER], planningOn: false });
    expect(screen.queryByText("Penciled work")).not.toBeInTheDocument();
  });

  it("spells out the row actions (Convert to ticket / Edit / Delete), no AI icon", () => {
    setup({ placeholders: [PLACEHOLDER], planningOn: true, onPlaceholderUpdate: vi.fn(), onPlaceholderPromote: vi.fn(), onPlaceholderDelete: vi.fn() });
    expect(screen.getByRole("button", { name: "Convert to ticket" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

// The next-sprint drop zone (BRDG-306) needs regular `PREFIX: N` sprint names so the
// series helpers engage. jsdom cannot complete a keyboard drag across droppables (no
// measured rects), so the move-resolution itself is unit-tested in epic-children-reorder;
// here we verify the drag-only visibility and affordances of the synthetic group.
describe("EpicChildrenBySprint next-sprint drop zone", () => {
  const REGULAR: Sprint[] = [
    { id: "138", name: "BT: 138", dateRange: "22 May - 4 Jun", state: "active", ticketCount: 0, startDate: "2026-05-22", endDate: null, goal: null },
    { id: "139", name: "BT: 139", dateRange: "5 Jun - 18 Jun", state: "future", ticketCount: 0, startDate: "2026-06-05", endDate: null, goal: null },
    { id: "142", name: "GXP: Backlog", dateRange: "", state: "backlog", ticketCount: 0, startDate: null, endDate: null, goal: null },
  ];

  function setupRegular(overrides: Partial<Parameters<typeof EpicChildrenBySprint>[0]> = {}) {
    const onMoveChild = vi.fn();
    render(
      <EpicChildrenBySprint
        items={[child("VPL-20", "BT: 138"), child("VPL-21", "GXP: Backlog")]}
        sprints={REGULAR}
        ticketKey="VPL-2"
        visibleFields={new Set(["issueKey", "status"])}
        renderMetadata={() => null}
        onJiraStatusChange={vi.fn()}
        onReadinessChange={vi.fn()}
        onMoveChild={onMoveChild}
        onCreateChild={vi.fn()}
        {...overrides}
      />,
    );
    return { onMoveChild };
  }

  function startKeyboardDrag(childKey: string) {
    const handle = screen.getByLabelText(`Drag ${childKey} to reorder or move it to another sprint`);
    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
  }

  it("does not show the next sprint as a group when no drag is active", () => {
    setupRegular();
    // Highest visible regular sprint is BT: 138 -> next is BT: 139, which exists,
    // but it must stay hidden until a drag begins.
    expect(screen.queryByText("BT: 139")).not.toBeInTheDocument();
  });

  it("surfaces the next regular sprint as an empty drop zone during a drag", () => {
    setupRegular();
    startKeyboardDrag("VPL-20");
    expect(screen.getByText("BT: 139")).toBeInTheDocument();
    expect(screen.getByText("Drop here to move to BT: 139")).toBeInTheDocument();
  });

  it("does not offer a create button on the synthetic drop zone", () => {
    setupRegular();
    startKeyboardDrag("VPL-20");
    expect(screen.queryByLabelText("Create issue in BT: 139")).not.toBeInTheDocument();
  });

  it("shows no next-sprint zone when it does not exist and no create handler is wired", () => {
    // Children sit in BT: 139 (the highest existing regular sprint); BT: 140 is absent.
    // Without onPlanNextSprint neither the BRDG-306 move zone nor the create zone appear.
    setupRegular({ items: [child("VPL-22", "BT: 139")] });
    startKeyboardDrag("VPL-22");
    expect(screen.queryByText("BT: 140")).not.toBeInTheDocument();
    expect(screen.queryByText("Drop here to move to BT: 140")).not.toBeInTheDocument();
    expect(screen.queryByText(/Create new sprint/)).not.toBeInTheDocument();
  });
});

// BRDG-309: the "create the next sprint" drop zone. It is the inverse of BRDG-306 -
// it appears only when the next regular sprint does NOT exist yet, and is wired only
// when the parent supplies onPlanNextSprint. As with BRDG-306, jsdom cannot complete
// a drag across droppables, so the drop -> modal flow is covered at the section level;
// here we verify drag-only + absent-only visibility and the distinct create affordances.
describe("EpicChildrenBySprint create-next-sprint drop zone (BRDG-309)", () => {
  const REGULAR: Sprint[] = [
    { id: "138", name: "BT: 138", dateRange: "22 May - 4 Jun", state: "active", ticketCount: 0, startDate: "2026-05-22", endDate: null, goal: null },
    { id: "139", name: "BT: 139", dateRange: "5 Jun - 18 Jun", state: "future", ticketCount: 0, startDate: "2026-06-05", endDate: null, goal: null },
  ];

  function setupCreate(overrides: Partial<Parameters<typeof EpicChildrenBySprint>[0]> = {}) {
    const onPlanNextSprint = vi.fn();
    render(
      <EpicChildrenBySprint
        // Highest existing regular sprint is BT: 139, so the next candidate is BT: 140,
        // which is absent from REGULAR -> the create zone is eligible.
        items={[child("VPL-30", "BT: 139")]}
        sprints={REGULAR}
        ticketKey="VPL-3"
        visibleFields={new Set(["issueKey", "status"])}
        renderMetadata={() => null}
        onJiraStatusChange={vi.fn()}
        onReadinessChange={vi.fn()}
        onMoveChild={vi.fn()}
        onCreateChild={vi.fn()}
        onPlanNextSprint={onPlanNextSprint}
        {...overrides}
      />,
    );
    return { onPlanNextSprint };
  }

  function startKeyboardDrag(childKey: string) {
    const handle = screen.getByLabelText(`Drag ${childKey} to reorder or move it to another sprint`);
    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
  }

  it("does not show the create zone until a drag begins", () => {
    setupCreate();
    expect(screen.queryByText(/Create new sprint/)).not.toBeInTheDocument();
    expect(screen.queryByText("New sprint")).not.toBeInTheDocument();
  });

  it("surfaces the create zone during a drag, hinting the predicted name", () => {
    setupCreate();
    startKeyboardDrag("VPL-30");
    expect(screen.getByText(/Create new sprint/)).toBeInTheDocument();
    // The predicted next name (BT: 139 + 1) is hinted in the zone: it shows both as
    // the group label and inline in the create body.
    expect(screen.getAllByText("BT: 140").length).toBeGreaterThan(0);
  });

  it("reads as a create action, not a plain move (distinct from BRDG-306)", () => {
    setupCreate();
    startKeyboardDrag("VPL-30");
    // Distinct "New sprint" treatment, and the next-sprint slot is a create, not a
    // plain "move here" into BT: 140.
    expect(screen.getByText("New sprint")).toBeInTheDocument();
    expect(screen.queryByText("Drop here to move to BT: 140")).not.toBeInTheDocument();
  });

  it("offers no create '+' button on the create zone (drag-only)", () => {
    setupCreate();
    startKeyboardDrag("VPL-30");
    expect(screen.queryByLabelText("Create issue in BT: 140")).not.toBeInTheDocument();
  });

  it("offers the create zone when dragging from a backlog, without parking in the latest sprint", () => {
    // Epic only sits in BT: Backlog; the series globally is at BT: 139. The create zone
    // offers the team's next sprint (BT: 140) so the backlog item can go straight in.
    setupCreate({
      items: [child("VPL-31", "BT: Backlog")],
      sprints: [...REGULAR, { id: "btbl", name: "BT: Backlog", dateRange: "", state: "future", ticketCount: 0, startDate: null, endDate: null, goal: null }],
    });
    startKeyboardDrag("VPL-31");
    expect(screen.getByText(/Create new sprint/)).toBeInTheDocument();
    expect(screen.getAllByText("BT: 140").length).toBeGreaterThan(0);
  });

  it("does not show the create zone when onPlanNextSprint is absent", () => {
    setupCreate({ onPlanNextSprint: undefined });
    startKeyboardDrag("VPL-30");
    expect(screen.queryByText(/Create new sprint/)).not.toBeInTheDocument();
  });

  it("shows a single move zone (not a create) when the next sprint already exists", () => {
    // Add BT: 140: the epic (top BT: 139) gets just the plain "move to BT: 140" zone -
    // the slot is filled by the move zone, so no create zone appears (mutually exclusive).
    setupCreate({
      sprints: [...REGULAR, { id: "140", name: "BT: 140", dateRange: "", state: "future", ticketCount: 0, startDate: "2026-06-19", endDate: null, goal: null }],
    });
    startKeyboardDrag("VPL-30");
    expect(screen.getByText("Drop here to move to BT: 140")).toBeInTheDocument();
    expect(screen.queryByText(/Create new sprint/)).not.toBeInTheDocument();
    expect(screen.queryByText("New sprint")).not.toBeInTheDocument();
  });
});

// Backlog drop zones: the team's "BT: Backlog" (a future-state sprint identified by
// name, not state) and the no-sprint "Unscheduled" backlog surface during a drag.
describe("EpicChildrenBySprint backlog drop zones", () => {
  // Backlog sprints arrive from Jira as state "future" (Jira has no "backlog" state).
  const WITH_BACKLOGS: Sprint[] = [
    { id: "138", name: "BT: 138", dateRange: "", state: "active", ticketCount: 0, startDate: "2026-05-22", endDate: null, goal: null },
    { id: "btbl", name: "BT: Backlog", dateRange: "", state: "future", ticketCount: 0, startDate: null, endDate: null, goal: null },
    { id: "gxpbl", name: "GXP: Backlog", dateRange: "", state: "future", ticketCount: 0, startDate: null, endDate: null, goal: null },
  ];

  function setupBacklogs() {
    render(
      <EpicChildrenBySprint
        items={[child("VPL-40", "BT: 138")]}
        sprints={WITH_BACKLOGS}
        ticketKey="VPL-4"
        visibleFields={new Set(["issueKey", "status"])}
        renderMetadata={() => null}
        onJiraStatusChange={vi.fn()}
        onReadinessChange={vi.fn()}
        onMoveChild={vi.fn()}
      />,
    );
  }

  function startKeyboardDrag(childKey: string) {
    const handle = screen.getByLabelText(`Drag ${childKey} to reorder or move it to another sprint`);
    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
  }

  it("does not show backlog zones until a drag begins", () => {
    setupBacklogs();
    expect(screen.queryByText("Drop here to move to BT: Backlog")).not.toBeInTheDocument();
    expect(screen.queryByText("Drop here to move to Unscheduled")).not.toBeInTheDocument();
  });

  it("surfaces the team's BT: Backlog as a drop zone during a drag", () => {
    setupBacklogs();
    startKeyboardDrag("VPL-40");
    expect(screen.getByText("Drop here to move to BT: Backlog")).toBeInTheDocument();
  });

  it("surfaces the no-sprint backlog (Unscheduled) as a drop zone during a drag", () => {
    setupBacklogs();
    startKeyboardDrag("VPL-40");
    expect(screen.getByText("Drop here to move to Unscheduled")).toBeInTheDocument();
  });

  it("does not surface another team's backlog the epic does not touch", () => {
    setupBacklogs();
    startKeyboardDrag("VPL-40");
    expect(screen.queryByText("Drop here to move to GXP: Backlog")).not.toBeInTheDocument();
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
