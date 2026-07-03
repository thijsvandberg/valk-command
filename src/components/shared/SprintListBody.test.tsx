import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SprintListBody } from "./SprintListBody";
import type { SprintListEntry } from "@/lib/sprint-list";

const SPRINTS: SprintListEntry[] = [
  { id: 1, name: "BT: 140", state: "active", startDate: "2026-06-22", endDate: "2026-07-05" },
  { id: 2, name: "BT: 141", state: "future", startDate: null, endDate: null },
  { id: 3, name: "BT: 139", state: "closed", startDate: "2026-06-08", endDate: "2026-06-21" },
  { id: 4, name: "BT: 138", state: "closed", startDate: "2026-05-25", endDate: "2026-06-07" },
  { id: 5, name: "GXP: 12", state: "active", startDate: "2026-06-24", endDate: "2026-07-07" },
  { id: 6, name: "GXP: 11", state: "closed", startDate: null, endDate: "2026-06-23", hidden: true },
];

function manageProps(overrides: Partial<React.ComponentProps<typeof SprintListBody>> = {}) {
  return {
    sprints: SPRINTS,
    variant: "manage" as const,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    pinnedIds: new Set(["1"]),
    onPin: vi.fn(),
    onToggleHidden: vi.fn(),
    onStakeholder: vi.fn(),
    onSync: vi.fn().mockResolvedValue(undefined),
    backlogCount: 7,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("SprintListBody manage variant", () => {
  it("renders the Pinned / Active & Future / Closed / Hidden sections with counts", () => {
    render(<SprintListBody {...manageProps()} />);
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Active & Future")).toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows all closed sprints when the section is expanded (see everything)", () => {
    render(<SprintListBody {...manageProps()} />);
    expect(screen.queryByText("BT: 139")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Closed"));
    expect(screen.getByText("BT: 139")).toBeInTheDocument();
    expect(screen.getByText("BT: 138")).toBeInTheDocument();
    // Hidden closed sprint stays out of the Closed section
    expect(screen.queryByText("GXP: 11")).not.toBeInTheDocument();
  });

  it("row click selects the sprint and closes", () => {
    const props = manageProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("BT: 140"));
    expect(props.onSelect).toHaveBeenCalledWith("1", "BT: 140", undefined);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("pin / hide / stakeholder icon clicks never trigger a select", () => {
    const props = manageProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getAllByTitle("Pin to tab")[0]);
    fireEvent.click(screen.getAllByTitle("Hide sprint")[0]);
    fireEvent.click(screen.getAllByTitle("View stakeholder")[0]);
    expect(props.onPin).toHaveBeenCalled();
    expect(props.onToggleHidden).toHaveBeenCalled();
    expect(props.onStakeholder).toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("backlog row selects the backlog pseudo-sprint", () => {
    const props = manageProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("Backlog"));
    expect(props.onSelect).toHaveBeenCalledWith("__backlog__", "Backlog");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("search flattens results across sections", () => {
    render(<SprintListBody {...manageProps()} />);
    fireEvent.change(screen.getByPlaceholderText("Search sprints..."), { target: { value: "139" } });
    expect(screen.getByText("BT: 139")).toBeInTheDocument();
    expect(screen.queryByText("BT: 140")).not.toBeInTheDocument();
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("multi-select toggles without closing and hides icon actions", () => {
    const props = manageProps({ multiSelect: true, selectedIds: new Set(["2"]), onToggleSelect: vi.fn() });
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("BT: 141"));
    expect(props.onToggleSelect).toHaveBeenCalledWith("2");
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Pin to tab")).not.toBeInTheDocument();
    // Backlog entry is not part of the multi-select filter list
    expect(screen.queryByText("Backlog")).not.toBeInTheDocument();
  });

  it("Escape closes the container", () => {
    const props = manageProps();
    render(<SprintListBody {...props} />);
    fireEvent.keyDown(screen.getByPlaceholderText("Search sprints..."), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("sync failure surfaces the error with a retry", async () => {
    const props = manageProps({ onSync: vi.fn().mockRejectedValue(new Error("Jira unreachable")) });
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("Sync sprints"));
    expect(await screen.findByText("Sync failed")).toBeInTheDocument();
    expect(screen.getByText("retry")).toBeInTheDocument();
  });
});

describe("SprintListBody select variant", () => {
  function selectProps(overrides: Partial<React.ComponentProps<typeof SprintListBody>> = {}) {
    return {
      sprints: SPRINTS,
      variant: "select" as const,
      onSelect: vi.fn(),
      onClose: vi.fn(),
      selectedId: "2",
      allowNone: true,
      onSelectNone: vi.fn(),
      ...overrides,
    };
  }

  it("lists only visible active & future sprints", () => {
    render(<SprintListBody {...selectProps()} />);
    expect(screen.getByText("BT: 140")).toBeInTheDocument();
    expect(screen.getByText("BT: 141")).toBeInTheDocument();
    expect(screen.queryByText("BT: 139")).not.toBeInTheDocument(); // closed
    expect(screen.queryByText("GXP: 11")).not.toBeInTheDocument(); // hidden
  });

  it("selecting a sprint fires onSelect and closes", () => {
    const props = selectProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("GXP: 12"));
    expect(props.onSelect).toHaveBeenCalledWith("5", "GXP: 12", undefined);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("the No sprint row fires onSelectNone and closes", () => {
    const props = selectProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("No sprint"));
    expect(props.onSelectNone).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("hides the No sprint row while searching", () => {
    render(<SprintListBody {...selectProps()} />);
    fireEvent.change(screen.getByPlaceholderText("Search sprints..."), { target: { value: "140" } });
    expect(screen.queryByText("No sprint")).not.toBeInTheDocument();
  });
});

describe("SprintListBody move variant", () => {
  function moveProps(overrides: Partial<React.ComponentProps<typeof SprintListBody>> = {}) {
    return {
      sprints: SPRINTS,
      variant: "move" as const,
      onSelect: vi.fn(),
      onClose: vi.fn(),
      pinnedOrder: ["5"],
      excludeSprintIds: new Set(["1"]),
      ...overrides,
    };
  }

  it("lists move destinations without excluded ids, pinned first", () => {
    render(<SprintListBody {...moveProps()} />);
    expect(screen.queryByText("BT: 140")).not.toBeInTheDocument(); // excluded
    const rows = screen.getAllByRole("button").map((el) => el.textContent);
    const gxp = rows.findIndex((t) => t?.includes("GXP: 12"));
    const bt = rows.findIndex((t) => t?.includes("BT: 141"));
    expect(gxp).toBeGreaterThan(-1);
    expect(bt).toBeGreaterThan(-1);
    expect(gxp).toBeLessThan(bt);
  });

  it("plain row click moves without an explicit position", () => {
    const props = moveProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("BT: 141"));
    expect(props.onSelect).toHaveBeenCalledWith("2", "BT: 141", undefined);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("the top / bottom buttons pass the position", () => {
    const props = moveProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getAllByTitle("Move to top of sprint")[0]);
    expect(props.onSelect).toHaveBeenCalledWith("5", "GXP: 12", "top");
    fireEvent.click(screen.getAllByTitle("Move to bottom of sprint")[1]);
    expect(props.onSelect).toHaveBeenCalledWith("2", "BT: 141", "bottom");
  });

  it("offers the Backlog bucket", () => {
    const props = moveProps();
    render(<SprintListBody {...props} />);
    fireEvent.click(screen.getByText("Backlog"));
    expect(props.onSelect).toHaveBeenCalledWith("__backlog__", "Backlog");
  });
});
