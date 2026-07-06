import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { EpicChild } from "@/types/ticket";
import { EpicSprintPlanning } from "./EpicSprintPlanning";

// The wrapper's only job is to feed the epic's REAL Jira children + the reused
// sprint-planning section (EpicChildrenSection -> EpicChildrenBySprint). Both the
// data hook and the heavy section are stubbed so these tests focus on the wiring:
// the right children go in, DRAFT cards never do, and the view is locked to sprints.
const mockUseTicketDetail = vi.fn();
vi.mock("@/hooks/useSprintBoard", () => ({
  useTicketDetail: (key: string) => mockUseTicketDetail(key),
}));

const sectionProps = vi.fn();
vi.mock("@/components/ticket-detail/EpicChildrenSection", () => ({
  EpicChildrenSection: (props: Record<string, unknown>) => {
    sectionProps(props);
    const items = (props.items as { key: string }[]) ?? [];
    return (
      <div data-testid="children-section" data-force-sprint={String(props.forceSprintView)}>
        {items.map((i) => (
          <div key={i.key}>{i.key}</div>
        ))}
        <button onClick={() => (props.onSelectTicket as (k: string) => void)?.("VPL-10")}>
          mock-select-child
        </button>
      </div>
    );
  },
}));

const CREATED_CHILDREN: EpicChild[] = [
  { key: "VPL-10", title: "First story", type: "story", jiraStatus: "TO DO", assignee: null, flagged: false, storyPoints: 3, businessValue: 7, sprintName: "Sprint 1", subtaskCount: 0, readiness: null, jiraRank: null },
  { key: "VPL-11", title: "Second story", type: "story", jiraStatus: "TO DO", assignee: null, flagged: false, storyPoints: null, businessValue: null, sprintName: null, subtaskCount: 0, readiness: null, jiraRank: null },
];

describe("EpicSprintPlanning (BRDG-486)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("feeds the epic's created children into the reused section, locked to sprint view", () => {
    mockUseTicketDetail.mockReturnValue({
      data: { epicChildren: CREATED_CHILDREN },
      isLoading: false,
      mutate: vi.fn(),
    });
    render(<EpicSprintPlanning epicKey="VPL-1" />);

    const section = screen.getByTestId("children-section");
    expect(section).toHaveAttribute("data-force-sprint", "true");
    expect(sectionProps).toHaveBeenCalledWith(
      expect.objectContaining({ items: CREATED_CHILDREN, ticketKey: "VPL-1", forceSprintView: true }),
    );
    expect(screen.getByText("VPL-10")).toBeInTheDocument();
    expect(screen.getByText("VPL-11")).toBeInTheDocument();
  });

  it("never lists DRAFT (uncreated) breakdown cards - only real Jira children are schedulable", () => {
    // The detail payload only ever carries created Jira children; a DRAFT card has no
    // Jira issue, so it is structurally absent from the source this view reads.
    mockUseTicketDetail.mockReturnValue({
      data: { epicChildren: CREATED_CHILDREN },
      isLoading: false,
      mutate: vi.fn(),
    });
    render(<EpicSprintPlanning epicKey="VPL-1" />);

    const passedItems = sectionProps.mock.calls[0][0].items as { key: string }[];
    expect(passedItems.every((i) => !i.key.startsWith("DRAFT-") && !i.key.startsWith("pending-"))).toBe(true);
    expect(passedItems.map((i) => i.key)).toEqual(["VPL-10", "VPL-11"]);
  });

  it("shows an empty state pointing to the Breakdown board when there are no created stories", () => {
    mockUseTicketDetail.mockReturnValue({
      data: { epicChildren: [] },
      isLoading: false,
      mutate: vi.fn(),
    });
    render(<EpicSprintPlanning epicKey="VPL-1" />);

    expect(screen.queryByTestId("children-section")).toBeNull();
    expect(screen.getByText(/No stories to plan yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Breakdown/)).toBeInTheDocument();
  });

  it("shows a loader while the epic detail is still loading", () => {
    mockUseTicketDetail.mockReturnValue({ data: undefined, isLoading: true, mutate: vi.fn() });
    const { container } = render(<EpicSprintPlanning epicKey="VPL-1" />);

    expect(screen.queryByTestId("children-section")).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("forwards a child selection to onSelectChild so it opens in-place", () => {
    mockUseTicketDetail.mockReturnValue({
      data: { epicChildren: CREATED_CHILDREN },
      isLoading: false,
      mutate: vi.fn(),
    });
    const onSelectChild = vi.fn();
    render(<EpicSprintPlanning epicKey="VPL-1" onSelectChild={onSelectChild} />);

    fireEvent.click(screen.getByText("mock-select-child"));
    expect(onSelectChild).toHaveBeenCalledWith("VPL-10");
  });
});
