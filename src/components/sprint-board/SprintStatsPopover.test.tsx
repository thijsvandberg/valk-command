import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintStatsPopover } from "./SprintStatsPopover";
import type { Ticket } from "@/types/ticket";

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test",
    type: "story",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    epic: null,
    epicKey: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    editState: "clean",
    notes: "",
    sprintId: "s1",
    businessValue: null,
    ...overrides,
  };
}

function createAnchorRef() {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({
    top: 100, bottom: 130, left: 200, right: 500, width: 300, height: 30, x: 200, y: 100, toJSON: () => {},
  });
  document.body.appendChild(el);
  return { current: el };
}

const TICKETS: Ticket[] = [
  makeTicket({ key: "VPL-1", jiraStatus: "DONE", storyPoints: 3, businessValue: 5, type: "story", epic: "Auth" }),
  makeTicket({ key: "VPL-2", jiraStatus: "IN PROGRESS", storyPoints: 5, businessValue: 3, type: "task", epic: "Auth" }),
  makeTicket({ key: "VPL-3", jiraStatus: "TEST", storyPoints: 2, businessValue: 2, type: "bug", epic: "Payments" }),
  makeTicket({ key: "VPL-4", jiraStatus: "TO DO", storyPoints: null, businessValue: null, type: "story", epic: null }),
  makeTicket({ key: "VPL-5", jiraStatus: "DONE", storyPoints: 1, businessValue: 1, type: "spike", epic: "Auth" }),
];

describe("SprintStatsPopover", () => {
  it("renders summary section with items, SP, and BV", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} />);

    expect(screen.getByText("Sprint Statistics")).toBeTruthy();
    expect(screen.getByText("Items")).toBeTruthy();
    // Items card contains the count
    const itemsCard = screen.getByText("Items").closest(".rounded-lg")!;
    expect(itemsCard.textContent).toContain("5");
    expect(screen.getByText("Story Points")).toBeTruthy();
    expect(screen.getByText("Business Value")).toBeTruthy();
  });

  it("renders status breakdown with correct counts", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} />);

    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.getByText("Test")).toBeTruthy();
    expect(screen.getByText("To Do")).toBeTruthy();
    expect(screen.getByText("By Status")).toBeTruthy();
  });

  it("renders type breakdown section", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} />);

    expect(screen.getByText("By Type")).toBeTruthy();
    expect(screen.getByText("story")).toBeTruthy();
    expect(screen.getByText("task")).toBeTruthy();
    expect(screen.getByText("bug")).toBeTruthy();
    expect(screen.getByText("spike")).toBeTruthy();
  });

  it("renders epic breakdown section with epic names", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} />);

    expect(screen.getByText("By Epic")).toBeTruthy();
    expect(screen.getByText("Auth")).toBeTruthy();
    expect(screen.getByText("Payments")).toBeTruthy();
    expect(screen.getByText("No Epic")).toBeTruthy();
  });

  it("sorts epics by SP descending", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} />);

    const epicSection = screen.getByText("By Epic").parentElement!;
    const epicNames = Array.from(epicSection.querySelectorAll(".truncate")).map((el) => el.textContent);
    // Auth has 3+5+1=9 SP, Payments has 2 SP, No Epic has 0 SP
    expect(epicNames).toEqual(["Auth", "Payments", "No Epic"]);
  });

  it("hides epic section when no tickets have an epic", () => {
    const ticketsNoEpic = TICKETS.map((t) => ({ ...t, epic: null }));
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={ticketsNoEpic} onClose={vi.fn()} anchorRef={anchorRef} />);

    expect(screen.queryByText("By Epic")).toBeNull();
  });

  it("shows unestimated warning when tickets lack story points", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} />);

    // VPL-4 has no story points and is not a spike
    expect(screen.getByText("1 ticket without estimate")).toBeTruthy();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={onClose} anchorRef={anchorRef} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking outside", () => {
    const onClose = vi.fn();
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={onClose} anchorRef={anchorRef} />);

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when clicking inside the popover", () => {
    const onClose = vi.fn();
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={onClose} anchorRef={anchorRef} />);

    const popover = screen.getByText("Sprint Statistics").closest("div.fixed") ?? screen.getByText("Sprint Statistics").parentElement!.parentElement!;
    fireEvent.mouseDown(popover);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("excludes DEPRECATED tickets from type and epic breakdowns", () => {
    const tickets = [
      makeTicket({ key: "VPL-1", jiraStatus: "DONE", storyPoints: 3, type: "story", epic: "Auth" }),
      makeTicket({ key: "VPL-2", jiraStatus: "DEPRECATED" as Ticket["jiraStatus"], storyPoints: 5, type: "task", epic: "Auth" }),
    ];
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={tickets} onClose={vi.fn()} anchorRef={anchorRef} />);

    // Type section should only show "story", not "task"
    expect(screen.getByText("story")).toBeTruthy();
    expect(screen.queryByText("task")).toBeNull();
  });

  it("shows sprint name when provided", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} sprintName="BT: 137" />);

    expect(screen.getByText("BT: 137")).toBeTruthy();
    expect(screen.queryByText("Sprint Statistics")).toBeNull();
  });

  it("shows remaining days when provided", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} workingDaysRemaining={3} totalWorkingDays={10} />);

    expect(screen.getByText("3 days left")).toBeTruthy();
  });

  it("shows last day indicator", () => {
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={vi.fn()} anchorRef={anchorRef} workingDaysRemaining={0} totalWorkingDays={10} />);

    expect(screen.getByText("Last day")).toBeTruthy();
  });

  it("calls onFilterStatus and onClose when clicking a status row", () => {
    const onClose = vi.fn();
    const onFilterStatus = vi.fn();
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={onClose} anchorRef={anchorRef} onFilterStatus={onFilterStatus} />);

    fireEvent.click(screen.getByText("Done"));
    expect(onFilterStatus).toHaveBeenCalledWith("DONE");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onFilterType and onClose when clicking a type row", () => {
    const onClose = vi.fn();
    const onFilterType = vi.fn();
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={onClose} anchorRef={anchorRef} onFilterType={onFilterType} />);

    fireEvent.click(screen.getByText("story"));
    expect(onFilterType).toHaveBeenCalledWith("story");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onFilterEpic and onClose when clicking an epic row", () => {
    const onClose = vi.fn();
    const onFilterEpic = vi.fn();
    const anchorRef = createAnchorRef();
    render(<SprintStatsPopover allTickets={TICKETS} onClose={onClose} anchorRef={anchorRef} onFilterEpic={onFilterEpic} />);

    fireEvent.click(screen.getByText("Auth"));
    expect(onFilterEpic).toHaveBeenCalledWith("Auth");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
