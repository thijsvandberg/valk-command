import { render, screen, fireEvent } from "@testing-library/react";
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
    Boxes: stub("boxes"),
    IterationCw: stub("iteration"),
    GripVertical: stub("grip"),
    AlertTriangle: stub("alert-triangle"),
    Trash2: stub("trash"),
    Scissors: stub("scissors"),
    Clock: stub("clock"),
    NotebookPen: stub("notebook"),
  };
});

vi.mock("@/components/shared/IssueMetaBadges", () => ({
  EpicBadge: ({ epic }: { epic: string }) => <span data-testid="epic-badge">{epic}</span>,
}));

// The warning chips render their own interactive popover/modal; the row test only cares
// that one chip renders per warning kind, so stub it to the human label text (BRDG-366).
vi.mock("./WarningBadge", () => {
  const LABELS: Record<string, string> = {
    unpointed: "No story point estimate",
    no_subtasks: "No subtasks",
    deprecated_with_points: "Deprecated but still has story points",
    closed_with_open_subtasks: "Closed with open subtasks",
  };
  return { WarningBadge: ({ kind }: { kind: string }) => <span data-testid={`warning-${kind}`}>{LABELS[kind]}</span> };
});

vi.mock("@/components/shared/AddEpicPill", () => ({
  AddEpicPill: ({ ticketKey }: { ticketKey: string }) => <span data-testid="add-epic" data-ticket={ticketKey} />,
}));

vi.mock("@/components/shared/EpicPicker", () => ({
  EpicPicker: ({ value, onViewInSidebar }: { value: { name: string } | null; onViewInSidebar?: () => void }) => (
    <span data-testid="epic-picker" data-epic={value?.name}>
      <button data-testid="epic-view-sidebar" onClick={() => onViewInSidebar?.()}>view</button>
    </span>
  ),
}));

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
vi.mock("@/components/shared/AssigneePicker", () => ({ AssigneePicker: () => <span data-testid="assignee-picker" /> }));
// BRDG-323: SP + guess are one unified chip; "sp" testid now marks that estimate
// chip. Clicking it reports the popover as open (onOpenChange) so slot-freeze can
// be exercised.
vi.mock("@/components/shared/EstimatePicker", () => ({
  EstimatePicker: ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => (
    <button data-testid="sp" onClick={() => onOpenChange?.(true)} />
  ),
}));
vi.mock("@/components/shared/BusinessValuePicker", () => ({ BusinessValuePicker: () => <span data-testid="bv" /> }));
vi.mock("@/components/shared/Tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("./TicketTableCells", () => ({
  EditStateDot: () => <span data-testid="editstate" />,
  QualityBadge: () => <span data-testid="quality" />,
}));

const ALL_TAGS = new Set<InlineTagId>(["flag", "refinement", "quality", "notes", "poReadiness", "editState", "storyPoints", "businessValue", "epic", "assignee"]);

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
    renderRow({ ticket: makeTicket({ assignee: { name: "Jane", initials: "J", color: "#000" } }) });
    expect(screen.getByTestId("pill")).toBeInTheDocument();
    expect(screen.getByText("Build onboarding")).toBeInTheDocument();
    expect(screen.getByTestId("sp")).toBeInTheDocument();
    expect(screen.getByTestId("bv")).toBeInTheDocument();
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  it("renders a Mark-as-read action only when onMarkRead is supplied, and fires it (BRDG-357)", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();

    const onMarkRead = vi.fn();
    renderRow({ onMarkRead });
    const btn = screen.getByRole("button", { name: "Mark as read" });
    fireEvent.click(btn);
    expect(onMarkRead).toHaveBeenCalledWith("VPL-1");
  });

  it("renders the reporter chip only when the creator tag is on and a reporter exists (BRDG-358)", () => {
    const reporter = { name: "Alice", initials: "A", color: "#000" };
    // Creator tag on + reporter present -> labelled chip shown.
    renderRow({ ticket: makeTicket({ reporter }), tags: new Set<InlineTagId>(["creator"]) });
    expect(screen.getByTitle("Reported by Alice")).toBeInTheDocument();

    // Creator tag off -> no creator avatar even though a reporter exists.
    renderRow({ ticket: makeTicket({ reporter }), tags: new Set<InlineTagId>(["assignee"]) });
    expect(screen.getAllByTitle("Reported by Alice")).toHaveLength(1);

    // No reporter -> nothing, even with the tag on.
    renderRow({ ticket: makeTicket({ reporter: null }), tags: new Set<InlineTagId>(["creator"]) });
    expect(screen.getAllByTitle("Reported by Alice")).toHaveLength(1);
  });

  it("renders the Story Writer link only when showStoryWriterLink is set, pointing at /write (BRDG-395)", () => {
    renderRow();
    expect(screen.queryByRole("link", { name: /Open in Story Writer/i })).toBeNull();

    renderRow({ showStoryWriterLink: true });
    const link = screen.getByRole("link", { name: /Open in Story Writer/i });
    expect(link).toHaveAttribute("href", "/tickets/VPL-1/write");
  });

  it("renders the created-date chip only when createdAtLabel is supplied (BRDG-358)", () => {
    renderRow();
    expect(screen.queryByText("3d ago")).toBeNull();
    renderRow({ createdAtLabel: "3d ago" });
    expect(screen.getByText("3d ago")).toBeInTheDocument();
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

  it("renders the epic picker dropdown (not a direct navigate) for an editable epic pill (BRDG-131)", () => {
    const onSelectTicket = vi.fn();
    renderRow({ onSelectTicket, onEpicChange: vi.fn() });
    const picker = screen.getByTestId("epic-picker");
    expect(picker.getAttribute("data-epic")).toBe("Onboarding");
    // The picker's "view in sidebar" action opens the epic; the row is not selected.
    fireEvent.click(screen.getByTestId("epic-view-sidebar"));
    expect(onSelectTicket).toHaveBeenCalledTimes(1);
    expect(onSelectTicket).toHaveBeenCalledWith("VPL-100");
  });

  it("shows a plain epic chip (no picker) when the row is not editable", () => {
    renderRow(); // no onEpicChange
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    expect(screen.queryByTestId("epic-picker")).toBeNull();
  });

  it("shows the Add-epic placeholder only when the row has no epic and is editable (BRDG-131)", () => {
    // No epic + editable -> placeholder shown
    renderRow({ ticket: makeTicket({ epic: null, epicKey: null }), onEpicChange: vi.fn() });
    expect(screen.getByTestId("add-epic")).toBeInTheDocument();

    // No epic but not editable (no handler) -> no placeholder
    renderRow({ ticket: makeTicket({ epic: null, epicKey: null }) });
    expect(screen.getAllByTestId("add-epic")).toHaveLength(1);

    // Has an epic -> badge, never the placeholder
    renderRow({ ticket: makeTicket(), onEpicChange: vi.fn() });
    expect(screen.getAllByTestId("add-epic")).toHaveLength(1);
  });

  it("hides the Add-epic placeholder when grouped by epic (hideEpic)", () => {
    renderRow({ ticket: makeTicket({ epic: null, epicKey: null }), onEpicChange: vi.fn(), hideEpic: true });
    expect(screen.queryByTestId("add-epic")).toBeNull();
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
      ticket: makeTicket({ qualityScore: 80, notes: "check", editState: "local_edits" }),
      refinementSessions: [{ name: "Refine A" } as never],
      tags: ALL_TAGS,
    });
    expect(screen.getByTestId("quality")).toBeInTheDocument();
    expect(screen.getByTestId("icon-notes")).toBeInTheDocument();
    expect(screen.getByTestId("editstate")).toBeInTheDocument();
    expect(screen.getByTestId("icon-boxes")).toBeInTheDocument();
  });

  it("hides the quality badge when the ticket has no score (BRDG-239)", () => {
    renderRow({ ticket: makeTicket({ qualityScore: null }), tags: ALL_TAGS });
    expect(screen.queryByTestId("quality")).toBeNull();
  });

  it("hides quality/notes/edit-state/refinement when their tags are off", () => {
    renderRow({
      ticket: makeTicket({ qualityScore: 80, notes: "check", editState: "local_edits" }),
      refinementSessions: [{ name: "Refine A" } as never],
      tags: new Set<InlineTagId>(["flag"]),
    });
    expect(screen.queryByTestId("quality")).toBeNull();
    expect(screen.queryByTestId("icon-notes")).toBeNull();
    expect(screen.queryByTestId("editstate")).toBeNull();
    expect(screen.queryByTestId("icon-gem")).toBeNull();
  });

  it("gates SP, BV, epic and assignee badges on the visibility set (BRDG-299)", () => {
    renderRow({ tags: new Set<InlineTagId>(["flag"]) });
    expect(screen.queryByTestId("sp")).toBeNull();
    expect(screen.queryByTestId("bv")).toBeNull();
    expect(screen.queryByTestId("avatar")).toBeNull();
    expect(screen.queryByText("Onboarding")).toBeNull();
  });

  it("shows each badge when only its own tag is on (BRDG-299)", () => {
    renderRow({ tags: new Set<InlineTagId>(["storyPoints"]) });
    expect(screen.getByTestId("sp")).toBeInTheDocument();
    expect(screen.queryByTestId("bv")).toBeNull();

    renderRow({ tags: new Set<InlineTagId>(["assignee"]), ticket: makeTicket({ assignee: { name: "Jane", initials: "J", color: "#000" } }) });
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  it("hides empty SP/BV on deprecated stories so no space is reserved", () => {
    renderRow({ ticket: makeTicket({ jiraStatus: "DEPRECATED", storyPoints: null, businessValue: null }) });
    expect(screen.queryByTestId("sp")).toBeNull();
    expect(screen.queryByTestId("bv")).toBeNull();
  });

  it("still shows SP/BV on deprecated stories when a value is set", () => {
    renderRow({ ticket: makeTicket({ jiraStatus: "DEPRECATED", storyPoints: 3, businessValue: 8 }) });
    expect(screen.getByTestId("sp")).toBeInTheDocument();
    expect(screen.getByTestId("bv")).toBeInTheDocument();
  });

  // BRDG-310: set badges show in their natural slot; the empty (applicable) planning
  // fields reserve no space and open on hover as a cluster to the LEFT of every set
  // badge, keeping the natural epic -> SP -> BV order among themselves.
  it("opens empty SP/BV placeholders on hover to the left of a set epic chip (no reserved space)", () => {
    renderRow({ ticket: makeTicket({ storyPoints: null, businessValue: null }), onEpicChange: vi.fn(), onStoryPointsChange: vi.fn(), onBusinessValueChange: vi.fn() });
    const sp = screen.getByTestId("sp");
    const bv = screen.getByTestId("bv");
    const epic = screen.getByTestId("epic-picker");

    // Wrapped in the collapse-to-nothing slot until the row is hovered.
    expect(sp.parentElement?.className).toContain("hidden");
    expect(sp.parentElement?.className).toContain("group-hover/row:inline-flex");
    expect(bv.parentElement?.className).toContain("hidden");

    // Placeholders sit before the set epic chip, in natural SP -> BV order.
    expect(sp.compareDocumentPosition(epic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sp.compareDocumentPosition(bv) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a set SP/BV inline after the epic chip, not in a hover-reveal slot", () => {
    renderRow({ ticket: makeTicket({ storyPoints: 5, businessValue: 8 }), onEpicChange: vi.fn() });
    const sp = screen.getByTestId("sp");
    const epic = screen.getByTestId("epic-picker");

    // Set value is width-gated (BRDG-451), not a hover-reveal slot.
    expect(sp.parentElement?.className).toContain("@[30rem]/boardrow:inline-flex");
    expect(sp.parentElement?.className).not.toContain("group-hover/row:inline-flex");
    expect(epic.compareDocumentPosition(sp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("treats N/A SP/BV (value 0, shown as '-') like unset: hover-reveal, not an inline badge", () => {
    renderRow({ ticket: makeTicket({ storyPoints: 0, businessValue: 0 }), onEpicChange: vi.fn(), onStoryPointsChange: vi.fn(), onBusinessValueChange: vi.fn() });
    const sp = screen.getByTestId("sp");
    const bv = screen.getByTestId("bv");

    // Wrapped in the collapse-to-nothing slot so the resting list stays calm.
    expect(sp.parentElement?.className).toContain("hidden");
    expect(sp.parentElement?.className).toContain("group-hover/row:inline-flex");
    expect(bv.parentElement?.className).toContain("hidden");
  });

  // In planning mode a guess is a resting estimate. The board keeps the guestimate
  // flow even for a ticket in a refinement session; SP-only entry is enforced inside
  // the session view, not on the board row.
  it("shows a planning guess as a resting estimate when the row is not in a refinement session", () => {
    renderRow({
      ticket: makeTicket({ storyPoints: null, businessValue: null, guestimation: 3 }),
      planningOn: true,
      onStoryPointsChange: vi.fn(),
      onGuestimationChange: vi.fn(),
    });
    // Inline (resting) value, not a hover-only placeholder: revealed by a width gate
    // (BRDG-451), never by row hover.
    const cls = screen.getByTestId("sp").parentElement!.className;
    expect(cls).toContain("@[30rem]/boardrow:inline-flex");
    expect(cls).not.toContain("group-hover/row:inline-flex");
  });

  it("keeps the guestimate flow on a board row that is in a refinement session", () => {
    renderRow({
      ticket: makeTicket({ storyPoints: null, businessValue: null, guestimation: 3 }),
      planningOn: true,
      onStoryPointsChange: vi.fn(),
      onGuestimationChange: vi.fn(),
      refinementSessions: [{ name: "Refine A" } as never],
    });
    // The planning guess still rests inline; it is not collapsed to an SP-only hover
    // placeholder. It is width-gated (BRDG-451), not hover-gated.
    const cls = screen.getByTestId("sp").parentElement!.className;
    expect(cls).toContain("@[30rem]/boardrow:inline-flex");
    expect(cls).not.toContain("group-hover/row:inline-flex");
  });

  it("freezes the estimate in its slot while open, so a first pick does not remount it (BRDG-323)", () => {
    const props = {
      ticket: makeTicket({ storyPoints: null, businessValue: null, guestimation: null }),
      ticketIdx: 0,
      isChecked: false,
      isSelected: false,
      someChecked: false,
      isDragActive: false,
      tags: ALL_TAGS,
      selectedTicket: null,
      onSelectTicket: vi.fn(),
      onCheckboxClick: vi.fn(),
      planningOn: true,
      onStoryPointsChange: vi.fn(),
      onGuestimationChange: vi.fn(),
    };
    const { rerender } = render(<table><tbody><BoardRow {...props} /></tbody></table>);
    // Empty: estimate sits in the hover-revealed placeholder slot.
    const placeholderClass = screen.getByTestId("sp").parentElement?.className ?? "";
    expect(placeholderClass).toContain("group-hover/row:inline-flex");

    // Open the popover, then a guess lands (parent re-renders with the new value).
    fireEvent.click(screen.getByTestId("sp"));
    rerender(
      <table><tbody><BoardRow {...props} ticket={makeTicket({ storyPoints: null, businessValue: null, guestimation: 2 })} /></tbody></table>,
    );

    // Still the SAME placeholder slot (not jumped to the inline value slot), so the
    // open dropdown is preserved long enough to reach the commit action.
    expect(screen.getByTestId("sp").parentElement?.className).toContain("group-hover/row:inline-flex");
  });

  it("clusters the add-epic / SP / BV placeholders in natural order when nothing is set", () => {
    renderRow({ ticket: makeTicket({ epic: null, epicKey: null, storyPoints: null, businessValue: null }), onEpicChange: vi.fn(), onStoryPointsChange: vi.fn(), onBusinessValueChange: vi.fn() });
    const addEpic = screen.getByTestId("add-epic");
    const sp = screen.getByTestId("sp");
    const bv = screen.getByTestId("bv");
    expect(addEpic.compareDocumentPosition(sp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sp.compareDocumentPosition(bv) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the placeholders to the left of a set refinement badge (no reserved gap)", () => {
    renderRow({
      ticket: makeTicket({ epic: null, epicKey: null, storyPoints: null, businessValue: null }),
      onEpicChange: vi.fn(),
      onStoryPointsChange: vi.fn(),
      onBusinessValueChange: vi.fn(),
      refinementSessions: [{ name: "Refine A" } as never],
    });
    const marker = screen.getByTestId("icon-boxes");
    const addEpic = screen.getByTestId("add-epic");
    const sp = screen.getByTestId("sp");
    const bv = screen.getByTestId("bv");
    // Every placeholder precedes the set refinement marker.
    expect(addEpic.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sp.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bv.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the refinement marker as a Boxes glyph with no session count (BRDG-321)", () => {
    const { container } = renderRow({
      ticket: makeTicket({}),
      // More than one session: the old design showed a count badge here; it is gone now.
      refinementSessions: [{ name: "Refine A" } as never, { name: "Refine B" } as never],
    });
    // The refinement marker renders exactly one Boxes glyph...
    expect(screen.getAllByTestId("icon-boxes")).toHaveLength(1);
    // ...and the icon-only pill carries no "2" (or any) session-count text.
    const marker = screen.getByTestId("icon-boxes").parentElement!;
    expect(marker.textContent).toBe("");
    expect(container.textContent).not.toContain("Refine A");
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

  it("renders the margin drag affordance only when the row is draggable", () => {
    renderRow();
    expect(screen.queryByTestId("icon-grip")).toBeNull();

    renderRow({ dragListeners: {} as never });
    expect(screen.getByTestId("icon-grip")).toBeInTheDocument();
  });

  it("hides the drag affordance during multiselect", () => {
    renderRow({ dragListeners: {} as never, someChecked: true });
    expect(screen.queryByTestId("icon-grip")).toBeNull();
  });

  it("reserves the checkbox gutter and keeps the box hidden until hover by default", () => {
    const { container } = renderRow();
    // Gutter is always present so content never shifts when the box fades in.
    const gutter = container.querySelector("div.w-3\\.5");
    expect(gutter).toBeInTheDocument();
    // The box itself is hidden until the row is hovered.
    const box = gutter!.querySelector("span");
    expect(box?.className).toContain("opacity-0");
    expect(box?.className).toContain("group-hover/row:opacity-100");
  });

  it("keeps the checkbox visible (no hover needed) while a selection is active", () => {
    const { container } = renderRow({ someChecked: true });
    const box = container.querySelector("div.w-3\\.5 span");
    expect(box?.className).toContain("opacity-100");
    expect(box?.className).not.toContain("opacity-0");
  });

  it("fires onCheckboxClick from the gutter in default (non-bulk) mode", () => {
    const onCheckboxClick = vi.fn();
    const { container } = renderRow({ onCheckboxClick });
    fireEvent.click(container.querySelector("div.w-3\\.5")!);
    expect(onCheckboxClick).toHaveBeenCalledWith("VPL-1", 0, false);
  });

  it("does not render a follow star, pipeline or deploy badge inline", () => {
    renderRow({ ticket: makeTicket({ flagged: true }) });
    expect(screen.queryByRole("button", { name: /follow/i })).toBeNull();
    // Rocket/GitBranch icons are never imported by the row.
    expect(screen.queryByTestId("icon-rocket")).toBeNull();
    expect(screen.queryByTestId("icon-gitbranch")).toBeNull();
  });

  // Warning filter mode: per-row hygiene badges (BRDG-313/366).
  it("renders a warning badge per problem when warnings is set", () => {
    renderRow({ warnings: ["unpointed", "closed_with_open_subtasks"] });
    expect(screen.getByText("No story point estimate")).toBeInTheDocument();
    expect(screen.getByText("Closed with open subtasks")).toBeInTheDocument();
  });

  it("renders no warning badges when the prop is absent or empty (mode off)", () => {
    const { rerender } = renderRow({ warnings: undefined });
    expect(screen.queryByText("No story point estimate")).toBeNull();
    rerender(
      <table><tbody>
        <BoardRow ticket={makeTicket()} ticketIdx={0} isChecked={false} isSelected={false} someChecked={false} isDragActive={false} tags={ALL_TAGS} warnings={[]} selectedTicket={null} onSelectTicket={vi.fn()} onCheckboxClick={vi.fn()} />
      </tbody></table>,
    );
    expect(screen.queryByText("No story point estimate")).toBeNull();
  });

  it("width-gates the badge cluster (hidden until the container is wide enough)", () => {
    // jsdom can't evaluate container queries, so assert the display-toggle gating class is
    // present: the cluster is `hidden` and only reveals at the @[52rem]/boardrow breakpoint,
    // so it reserves no space on narrow rows.
    renderRow({ warnings: ["unpointed"] });
    const labelEl = screen.getByText("No story point estimate");
    const cluster = labelEl.parentElement!;
    expect(cluster.className).toContain("hidden");
    expect(cluster.className).toContain("@[52rem]/boardrow:inline-flex");
  });

  // Progressive badge hiding on a narrow list column (BRDG-451). jsdom can't evaluate
  // container queries, so we assert the display-toggle gating classes are present in the
  // agreed staggered order (refinement 40 > BV 34 > SP 30 > epic 26): a larger breakpoint
  // drops earlier, so refinement disappears first and epic survives longest.
  describe("progressive badge hiding on narrow columns (BRDG-451)", () => {
    // Walk up from a badge's leaf to the nearest ancestor carrying a `@[Nrem]/boardrow`
    // gate, returning that element (robust to how deeply the badge nests its own markup).
    const GATE_RE = /@\[(\d+)rem\]\/boardrow:(?:inline-flex|flex|block)/;
    function gateOf(leaf: HTMLElement | null): HTMLElement {
      let cur = leaf;
      while (cur) {
        if (typeof cur.className === "string" && GATE_RE.test(cur.className)) return cur;
        cur = cur.parentElement;
      }
      throw new Error("no @[Nrem]/boardrow gate ancestor found");
    }
    const remOf = (el: HTMLElement) => Number(el.className.match(GATE_RE)![1]);

    it("gates the SP value badge with hidden + @[30rem]/boardrow:inline-flex", () => {
      renderRow({ ticket: makeTicket({ storyPoints: 5 }) });
      const gate = gateOf(screen.getByTestId("sp"));
      expect(gate.className).toContain("hidden");
      expect(gate.className).toContain("@[30rem]/boardrow:inline-flex");
    });

    it("gates the BV value badge with hidden + @[34rem]/boardrow:inline-flex", () => {
      renderRow({ ticket: makeTicket({ businessValue: 8 }) });
      const gate = gateOf(screen.getByTestId("bv"));
      expect(gate.className).toContain("hidden");
      expect(gate.className).toContain("@[34rem]/boardrow:inline-flex");
    });

    it("gates the refinement badge with hidden + @[40rem]/boardrow:inline-flex", () => {
      renderRow({ refinementSessions: [{ name: "Refine A" } as never] });
      const gate = gateOf(screen.getByTestId("icon-boxes"));
      expect(gate.className).toContain("hidden");
      expect(gate.className).toContain("@[40rem]/boardrow:inline-flex");
    });

    it("gates the epic picker branch with hidden + @[26rem]/boardrow:flex", () => {
      renderRow({ onEpicChange: vi.fn() });
      const gate = gateOf(screen.getByTestId("epic-picker"));
      expect(gate.className).toContain("hidden");
      expect(gate.className).toContain("@[26rem]/boardrow:flex");
      // Keeps graceful compression above the gate before it finally hides.
      expect(gate.className).toContain("min-w-0");
      expect(gate.className).toContain("shrink");
    });

    it("gates the epic badge branch (no edit handler) with hidden + @[26rem]/boardrow:flex", () => {
      renderRow();
      const gate = gateOf(screen.getByTestId("epic-badge"));
      expect(gate.className).toContain("hidden");
      expect(gate.className).toContain("@[26rem]/boardrow:flex");
    });

    it("staggers the four gates so they drop in order refinement > BV > SP > epic", () => {
      renderRow({
        ticket: makeTicket({ storyPoints: 5, businessValue: 8 }),
        refinementSessions: [{ name: "Refine A" } as never],
        onEpicChange: vi.fn(),
      });
      const refine = remOf(gateOf(screen.getByTestId("icon-boxes")));
      const bv = remOf(gateOf(screen.getByTestId("bv")));
      const sp = remOf(gateOf(screen.getByTestId("sp")));
      const epic = remOf(gateOf(screen.getByTestId("epic-picker")));
      expect(refine).toBeGreaterThan(bv);
      expect(bv).toBeGreaterThan(sp);
      expect(sp).toBeGreaterThan(epic);
    });

    // BRDG-453 extends the ladder: avatar (widest) drops first, then the badges, then the
    // leading checkbox gutter (22rem) and ticket key (18rem, gated inside TicketStatusPill).
    it("gates the assignee avatar with hidden + @[44rem]/boardrow:block (drops first)", () => {
      renderRow({ onAssigneeChange: vi.fn() });
      const gate = screen.getByTestId("assignee-picker").parentElement!;
      expect(gate.className).toContain("hidden");
      expect(gate.className).toContain("@[44rem]/boardrow:block");
    });

    it("width-gates the selection checkbox gutter with hidden + @[22rem]/boardrow:flex (BRDG-453)", () => {
      const { container } = renderRow();
      const gutter = container.querySelector("div.w-3\\.5")!;
      expect(gutter.className).toContain("hidden");
      expect(gutter.className).toContain("@[22rem]/boardrow:flex");
    });

    it("hides the checkbox gutter even while a selection is active (per PO)", () => {
      const { container } = renderRow({ someChecked: true });
      const gutter = container.querySelector("div.w-3\\.5")!;
      expect(gutter.className).toContain("hidden");
      expect(gutter.className).toContain("@[22rem]/boardrow:flex");
    });

    it("keeps the avatar gate wider than the badge gates so it drops first", () => {
      renderRow({
        ticket: makeTicket({ storyPoints: 5, businessValue: 8 }),
        refinementSessions: [{ name: "Refine A" } as never],
        onEpicChange: vi.fn(),
        onAssigneeChange: vi.fn(),
      });
      const avatar = remOf(screen.getByTestId("assignee-picker").parentElement!);
      const refine = remOf(gateOf(screen.getByTestId("icon-boxes")));
      expect(avatar).toBeGreaterThan(refine); // 44 > 40
    });
  });

  // Story Writer landing session decorations (BRDG-325). All optional; absent on the board.
  describe("session decorations (BRDG-325)", () => {
    it("renders nothing extra when no session props are passed (inert on the board)", () => {
      renderRow();
      expect(screen.queryByText("Split")).toBeNull();
      expect(screen.queryByText("Jira changed")).toBeNull();
      expect(screen.queryByTestId("icon-clock")).toBeNull();
      expect(screen.queryByText("Clear session")).toBeNull();
    });

    it("shows the Split badge and the muted target title for a split session", () => {
      renderRow({ splitTarget: "Target story title" });
      expect(screen.getByText("Split")).toBeInTheDocument();
      expect(screen.getByText("Target story title")).toBeInTheDocument();
    });

    it("shows the Split badge but no secondary line when the split target title is empty", () => {
      renderRow({ splitTarget: null });
      expect(screen.getByText("Split")).toBeInTheDocument();
    });

    it("shows the amber 'Jira changed' badge only when flagged", () => {
      renderRow({ sessionJiraChanged: true });
      expect(screen.getByText("Jira changed")).toBeInTheDocument();
      renderRow({ sessionJiraChanged: false });
      expect(screen.getAllByText("Jira changed")).toHaveLength(1);
    });

    it("shows the relative-time chip when provided", () => {
      renderRow({ sessionTimeAgo: "6h ago" });
      expect(screen.getByText("6h ago")).toBeInTheDocument();
    });

    it("activates (resume) on row click instead of selecting, when onActivate is set", () => {
      const onActivate = vi.fn();
      const onSelectTicket = vi.fn();
      renderRow({ onActivate, onSelectTicket });
      fireEvent.click(screen.getByText("Build onboarding"));
      expect(onActivate).toHaveBeenCalledWith("VPL-1");
      expect(onSelectTicket).not.toHaveBeenCalled();
    });

    it("falls back to selecting the row when onActivate is absent (board behaviour)", () => {
      const onSelectTicket = vi.fn();
      renderRow({ onSelectTicket });
      fireEvent.click(screen.getByText("Build onboarding"));
      expect(onSelectTicket).toHaveBeenCalledWith("VPL-1");
    });

    it("clears the session via the 'Clear session' overlay without activating the row", () => {
      const onActivate = vi.fn();
      const onDiscard = vi.fn();
      renderRow({ onActivate, onDiscard });
      fireEvent.click(screen.getByRole("button", { name: /clear session/i }));
      expect(onDiscard).toHaveBeenCalledWith("VPL-1");
      expect(onActivate).not.toHaveBeenCalled();
    });

    it("does not activate or discard the row when an inline picker is clicked", () => {
      const onActivate = vi.fn();
      const onDiscard = vi.fn();
      renderRow({ onActivate, onDiscard, onStoryPointsChange: vi.fn() });
      fireEvent.click(screen.getByTestId("sp"));
      expect(onActivate).not.toHaveBeenCalled();
      expect(onDiscard).not.toHaveBeenCalled();
    });
  });

  // Read-only meta on the Story Writer landing (BRDG-325): no edit handlers passed.
  describe("read-only meta (BRDG-325)", () => {
    it("suppresses the empty estimate placeholder when the estimate is not editable", () => {
      // No onStoryPointsChange and not in planning mode -> nothing to set, so no placeholder.
      renderRow({ ticket: makeTicket({ storyPoints: null }), onEpicChange: vi.fn() });
      expect(screen.queryByTestId("sp")).toBeNull();
    });

    it("still shows a set story-point value read-only without an edit handler", () => {
      renderRow({ ticket: makeTicket({ storyPoints: 5 }) });
      expect(screen.getByTestId("sp")).toBeInTheDocument();
    });

    it("drops the checkbox gutter when hideCheckbox is set", () => {
      const withBox = renderRow();
      expect(withBox.container.querySelector("div.w-3\\.5")).toBeInTheDocument();

      const withoutBox = renderRow({ hideCheckbox: true });
      expect(withoutBox.container.querySelector("div.w-3\\.5")).toBeNull();
    });

    it("shows a read-only assignee avatar when assigned but no empty grey placeholder when not", () => {
      renderRow({ ticket: makeTicket({ assignee: { name: "Jane", initials: "J", color: "#000" } }) });
      expect(screen.getByTestId("avatar")).toBeInTheDocument();

      renderRow({ ticket: makeTicket({ assignee: null }) });
      // Only the one avatar from the first render; the unassigned read-only row shows none.
      expect(screen.getAllByTestId("avatar")).toHaveLength(1);
    });
  });

  // BRDG-368: sprint board hides the assignee on terminal/unassigned rows until hover.
  // The wrapper always reserves the 26px width, so reveal is opacity-only (no layout shift).
  // Assertions read the assignee wrapper's className since Avatar is mocked.
  describe("hide-assignee-until-hover (BRDG-368)", () => {
    const ASSIGNED = { name: "Jane", initials: "J", color: "#000" };
    // The assignee wrapper is the trailing `.ml-1.5` cluster; query it directly.
    const wrapper = (container: HTMLElement) => container.querySelector("div.ml-1\\.5") as HTMLElement;

    it("hides the avatar by default on a DONE row and reveals it on hover/focus", () => {
      const { container } = renderRow({
        ticket: makeTicket({ jiraStatus: "DONE", assignee: ASSIGNED }),
        hideAssigneeUntilHover: true,
      });
      const cls = wrapper(container).className;
      expect(cls).toContain("opacity-0");
      expect(cls).toContain("group-hover/row:opacity-100");
      expect(cls).toContain("focus-within:opacity-100");
      // Opacity-only transition, never transition-all.
      expect(cls).toContain("transition-opacity");
      expect(cls).not.toContain("transition-all");
    });

    it("collapses Closed/Resolved onto DONE via the canonical normalizer", () => {
      for (const status of ["Closed", "Resolved", "DEPRECATED"]) {
        const { container } = renderRow({
          ticket: makeTicket({ jiraStatus: status as never, assignee: ASSIGNED }),
          hideAssigneeUntilHover: true,
        });
        expect(wrapper(container).className).toContain("opacity-0");
      }
    });

    it("hides an unassigned active row's picker until hover", () => {
      const { container } = renderRow({
        ticket: makeTicket({ jiraStatus: "TO DO", assignee: null }),
        hideAssigneeUntilHover: true,
      });
      expect(wrapper(container).className).toContain("group-hover/row:opacity-100");
    });

    it("keeps the avatar always visible on an active, assigned row (regression guard)", () => {
      const { container } = renderRow({
        ticket: makeTicket({ jiraStatus: "IN PROGRESS", assignee: ASSIGNED }),
        hideAssigneeUntilHover: true,
      });
      expect(wrapper(container).className).not.toContain("opacity-0");
    });

    it("leaves the avatar always visible when the prop is omitted (non-board hosts unchanged)", () => {
      // Terminal + unassigned, the worst case, still shows because the host did not opt in.
      const { container } = renderRow({ ticket: makeTicket({ jiraStatus: "DONE", assignee: null }) });
      expect(wrapper(container).className).not.toContain("opacity-0");
    });
  });

  // BRDG-434: inbox "new since last visit" leading-edge dot.
  describe("new-since-last-visit marker (BRDG-434)", () => {
    const DOT = "New since your last visit"; // Tooltip is mocked to passthrough; sr-only text identifies the dot.

    it("paints the dot when the row is new", () => {
      renderRow({ isNewSinceLastViewed: true });
      expect(screen.getByText(DOT)).toBeInTheDocument();
    });

    it("reserves the slot but paints no dot when the row is not new", () => {
      const { container } = renderRow({ isNewSinceLastViewed: false });
      expect(screen.queryByText(DOT)).toBeNull();
      // The fixed-width slot is still present so keys stay aligned with new rows.
      expect(container.querySelector("span.w-2")).toBeInTheDocument();
    });

    it("renders neither slot nor dot when the prop is absent (inert on the board)", () => {
      const { container } = renderRow();
      expect(screen.queryByText(DOT)).toBeNull();
      expect(container.querySelector("span.w-2")).toBeNull();
    });
  });

  // BRDG-434: inbox collapses the empty assignee slot on unassigned read-only rows.
  describe("collapse empty assignee (BRDG-434)", () => {
    const ASSIGNED = { name: "Jane", initials: "J", color: "#000" };
    const wrapper = (container: HTMLElement) => container.querySelector("div.ml-1\\.5");

    it("drops the assignee slot when opted in, unassigned and read-only", () => {
      const { container } = renderRow({ ticket: makeTicket({ assignee: null }), hideEmptyAssignee: true });
      expect(wrapper(container)).toBeNull();
    });

    it("still shows the avatar when an assignee is present", () => {
      renderRow({ ticket: makeTicket({ assignee: ASSIGNED }), hideEmptyAssignee: true });
      expect(screen.getByTestId("avatar")).toBeInTheDocument();
    });

    it("keeps the slot for an editable unassigned row (picker must stay reachable)", () => {
      const { container } = renderRow({ ticket: makeTicket({ assignee: null }), hideEmptyAssignee: true, onAssigneeChange: vi.fn() });
      expect(wrapper(container)).toBeInTheDocument();
    });

    it("keeps the empty spacer when the prop is omitted (board / other hosts unchanged)", () => {
      const { container } = renderRow({ ticket: makeTicket({ assignee: null }) });
      expect(wrapper(container)).toBeInTheDocument();
    });
  });

  // BRDG-389: opt-in list-host extensions so the cleanup + refinement lists can render
  // through BoardRow. All default-off and inert for the board / inbox / Story Writer / epic.
  describe("list-host extensions (BRDG-389)", () => {
    // The row's content surface is the `group/row` div inside the single <td>.
    const contentDiv = (container: HTMLElement) => container.querySelector("td > div") as HTMLElement;

    it("uses the default tight padding and switches to relaxed padding when spacious", () => {
      // BRDG-414: row padding lives on the inner row div; the outer group/row div is the
      // surface wrapper (it shares its tint/accent with the status-change line below).
      const rowInner = (c: HTMLElement) => c.querySelector("td > div > div") as HTMLElement;
      const { container: tight } = renderRow();
      expect(rowInner(tight).className).toContain("py-[7px]");
      expect(rowInner(tight).className).not.toContain("py-[10px]");

      const { container: relaxed } = renderRow({ spacious: true });
      expect(rowInner(relaxed).className).toContain("py-[10px]");
      expect(rowInner(relaxed).className).not.toContain("py-[7px]");
    });

    it("keeps the checkbox always visible (no hover) when inlineCheckbox is set, with no selection active", () => {
      const { container } = renderRow({ inlineCheckbox: true, someChecked: false, isChecked: false });
      const box = container.querySelector("div.w-3\\.5 span");
      expect(box?.className).toContain("opacity-100");
      expect(box?.className).not.toContain("opacity-0");
    });

    it("renders a trailing metadata slot only when supplied, click-isolated", () => {
      renderRow();
      expect(screen.queryByTestId("meta-slot")).toBeNull();

      const { container } = renderRow({ metadataSlot: <span data-testid="meta-slot">scores</span> });
      const slot = screen.getByTestId("meta-slot");
      expect(slot).toBeInTheDocument();
      // Wrapped in the z-20 click-isolated span so inner pickers stay reachable.
      expect(slot.parentElement?.className).toContain("z-20");
      // Slot sits inside the row content surface.
      expect(contentDiv(container).contains(slot)).toBe(true);
    });

    it("renders an external drag-handle slot and suppresses the native reorder grip", () => {
      // dragListeners present alone -> native grip shows.
      const native = renderRow({ dragListeners: {} as never });
      expect(native.container.querySelector('[data-testid="icon-grip"]')).toBeInTheDocument();

      // A host drag handle replaces the native grip so the two never stack.
      renderRow({ dragListeners: {} as never, dragHandleSlot: <button aria-label="drag-into-queue" /> });
      expect(screen.getByLabelText("drag-into-queue")).toBeInTheDocument();
      // Only the one native grip from the first render; the second render adds none.
      expect(screen.getAllByTestId("icon-grip")).toHaveLength(1);
    });

    it("hides the external drag-handle slot during multiselect (someChecked)", () => {
      renderRow({ dragHandleSlot: <button aria-label="drag-into-queue" />, someChecked: true });
      expect(screen.queryByLabelText("drag-into-queue")).toBeNull();
    });

    it("exposes data-ticket-key on the row for FLIP reorder hosts", () => {
      const { container } = renderRow({ "data-ticket-key": "VPL-1" } as Partial<BoardRowBaseProps>);
      expect(container.querySelector('tr[data-ticket-key="VPL-1"]')).toBeInTheDocument();
    });

    it("rounds the top corners only when isFirstInCard, the mirror of isLastInCard", () => {
      const { container: plain } = renderRow();
      expect(contentDiv(plain).className).not.toContain("rounded-t-[11px]");

      const { container: first } = renderRow({ isFirstInCard: true });
      expect(contentDiv(first).className).toContain("rounded-t-[11px]");

      const { container: last } = renderRow({ isLastInCard: true });
      expect(contentDiv(last).className).toContain("rounded-b-[11px]");
    });
  });
});
