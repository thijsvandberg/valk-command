import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BoardRow, type BoardRowBaseProps } from "./BoardRow";
import type { Ticket } from "@/types/ticket";
import type { InlineTagId } from "./filter-bar-types";

vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    Flag: stub("flag"),
    MessageSquare: stub("notes"),
    Pencil: stub("pencil"),
    Check: stub("check"),
    X: stub("x"),
    Gem: stub("gem"),
    IterationCw: stub("iteration"),
  };
});

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: null, isDragging: false }),
}));
vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => "" } } }));

vi.mock("@/lib/prefetch", () => ({ prefetchTicketPage: vi.fn() }));

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: (props: { showReadiness?: boolean }) => (
    <span data-testid="pill" data-show-readiness={String(props.showReadiness)} />
  ),
}));

vi.mock("@/components/shared/Avatar", () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock("@/components/shared/StoryPointPicker", () => ({ StoryPointPicker: () => <span data-testid="sp" /> }));
vi.mock("@/components/shared/BusinessValuePicker", () => ({ BusinessValuePicker: () => <span data-testid="bv" /> }));
vi.mock("@/components/shared/Tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("./TicketTableCells", () => ({
  EditStateDot: () => <span data-testid="editstate" />,
  QualityBadge: () => <span data-testid="quality" />,
}));

const ALL_TAGS = new Set<InlineTagId>(["flag", "refinement", "quality", "notes", "poReadiness", "editState"]);

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Build onboarding",
    type: "story",
    epic: "Onboarding",
    epicKey: "VPL-100",
    jiraStatus: "TO DO",
    storyPoints: 5,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    ...overrides,
  } as Ticket;
}

function renderRow(props: Partial<BoardRowBaseProps> = {}) {
  const base: BoardRowBaseProps = {
    ticket: makeTicket(),
    ticketIdx: 0,
    isChecked: false,
    isSelected: false,
    someChecked: false,
    isDragActive: false,
    tags: ALL_TAGS,
    selectedTicket: null,
    onSelectTicket: vi.fn(),
    onCheckboxClick: vi.fn(),
    ...props,
  };
  return render(
    <table><tbody><BoardRow {...base} /></tbody></table>,
  );
}

describe("BoardRow (headerless, BRDG-239)", () => {
  it("renders pill, title, SP, BV and assignee", () => {
    renderRow();
    expect(screen.getByTestId("pill")).toBeInTheDocument();
    expect(screen.getByText("Build onboarding")).toBeInTheDocument();
    expect(screen.getByTestId("sp")).toBeInTheDocument();
    expect(screen.getByTestId("bv")).toBeInTheDocument();
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  it("shows the epic chip by default and hides it when hideEpic is set", () => {
    const { rerender } = renderRow();
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    rerender(
      <table><tbody>
        <BoardRow ticket={makeTicket()} ticketIdx={0} isChecked={false} isSelected={false} someChecked={false} isDragActive={false} tags={ALL_TAGS} hideEpic selectedTicket={null} onSelectTicket={vi.fn()} onCheckboxClick={vi.fn()} />
      </tbody></table>,
    );
    expect(screen.queryByText("Onboarding")).toBeNull();
  });

  it("gates the flag tag on both the flag field and the visibility set", () => {
    renderRow({ ticket: makeTicket({ flagged: true }) });
    expect(screen.getByTestId("icon-flag")).toBeInTheDocument();

    renderRow({ ticket: makeTicket({ flagged: true }), tags: new Set<InlineTagId>(["quality"]) });
    // Only one flag icon should exist (from the first render); the second render adds none.
    expect(screen.getAllByTestId("icon-flag")).toHaveLength(1);
  });

  it("gates quality, notes, edit-state and refinement tags on the visibility set", () => {
    renderRow({
      ticket: makeTicket({ qualityScore: 80, notes: "check", editState: "draft" }),
      refinementSessions: [{ name: "Refine A" } as never],
      tags: ALL_TAGS,
    });
    expect(screen.getByTestId("quality")).toBeInTheDocument();
    expect(screen.getByTestId("icon-notes")).toBeInTheDocument();
    expect(screen.getByTestId("editstate")).toBeInTheDocument();
    expect(screen.getByTestId("icon-gem")).toBeInTheDocument();
  });

  it("hides the quality badge when the ticket has no score (BRDG-239)", () => {
    renderRow({ ticket: makeTicket({ qualityScore: null }), tags: ALL_TAGS });
    expect(screen.queryByTestId("quality")).toBeNull();
  });

  it("hides quality/notes/edit-state/refinement when their tags are off", () => {
    renderRow({
      ticket: makeTicket({ qualityScore: 80, notes: "check", editState: "draft" }),
      refinementSessions: [{ name: "Refine A" } as never],
      tags: new Set<InlineTagId>(["flag"]),
    });
    expect(screen.queryByTestId("quality")).toBeNull();
    expect(screen.queryByTestId("icon-notes")).toBeNull();
    expect(screen.queryByTestId("editstate")).toBeNull();
    expect(screen.queryByTestId("icon-gem")).toBeNull();
  });

  it("drives the pill readiness segment via the poReadiness tag", () => {
    renderRow({ tags: new Set<InlineTagId>(["poReadiness"]) });
    expect(screen.getByTestId("pill").getAttribute("data-show-readiness")).toBe("true");

    renderRow({ tags: new Set<InlineTagId>(["flag"]) });
    const pills = screen.getAllByTestId("pill");
    expect(pills[pills.length - 1].getAttribute("data-show-readiness")).toBe("false");
  });

  it("shows the sprint name only when showSprint is set", () => {
    renderRow({
      ticket: makeTicket({ sprintId: "42" } as Partial<Ticket>),
      sprintNameMap: { "42": "BT: 138" },
      showSprint: true,
    });
    expect(screen.getByText("BT: 138")).toBeInTheDocument();

    renderRow({
      ticket: makeTicket({ sprintId: "42" } as Partial<Ticket>),
      sprintNameMap: { "42": "BT: 138" },
      showSprint: false,
    });
    // Still only the one occurrence from the first render.
    expect(screen.getAllByText("BT: 138")).toHaveLength(1);
  });

  it("does not render a follow star, pipeline or deploy badge inline", () => {
    renderRow({ ticket: makeTicket({ flagged: true }) });
    expect(screen.queryByRole("button", { name: /follow/i })).toBeNull();
    // Rocket/GitBranch icons are never imported by the row.
    expect(screen.queryByTestId("icon-rocket")).toBeNull();
    expect(screen.queryByTestId("icon-gitbranch")).toBeNull();
  });
});
