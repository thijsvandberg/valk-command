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
  };
});

vi.mock("@/components/shared/IssueMetaBadges", () => ({
  EpicBadge: ({ epic }: { epic: string }) => <span data-testid="epic-badge">{epic}</span>,
}));

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
      ticket: makeTicket({ qualityScore: 80, notes: "check", editState: "draft" }),
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
      ticket: makeTicket({ qualityScore: 80, notes: "check", editState: "draft" }),
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

    expect(sp.parentElement?.className).not.toContain("hidden");
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

  // BRDG-323: in planning mode a guess is a resting estimate, but a ticket being
  // refined is estimated with story points only — no guess on those rows.
  it("shows a planning guess as a resting estimate when the row is not in a refinement session", () => {
    renderRow({
      ticket: makeTicket({ storyPoints: null, businessValue: null, guestimation: 3 }),
      planningOn: true,
      onStoryPointsChange: vi.fn(),
      onGuestimationChange: vi.fn(),
    });
    // Inline (resting) value, not a hover-only placeholder.
    expect(screen.getByTestId("sp").parentElement?.className).not.toContain("hidden");
  });

  it("drops the guess (story points only) on a ticket in a refinement session", () => {
    renderRow({
      ticket: makeTicket({ storyPoints: null, businessValue: null, guestimation: 3 }),
      planningOn: true,
      onStoryPointsChange: vi.fn(),
      onGuestimationChange: vi.fn(),
      refinementSessions: [{ name: "Refine A" } as never],
    });
    // No resting guess: the estimate collapses to an empty SP placeholder (hover-reveal).
    expect(screen.getByTestId("sp").parentElement?.className).toContain("hidden");
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

  // Warning filter mode: per-row hygiene labels (BRDG-313).
  it("renders a warning label per problem when warningLabels is set", () => {
    renderRow({ warningLabels: ["No story point estimate", "Closed with open subtasks"] });
    expect(screen.getByText("No story point estimate")).toBeInTheDocument();
    expect(screen.getByText("Closed with open subtasks")).toBeInTheDocument();
  });

  it("renders no warning labels when the prop is absent or empty (mode off)", () => {
    const { rerender } = renderRow({ warningLabels: undefined });
    expect(screen.queryByText("No story point estimate")).toBeNull();
    rerender(
      <table><tbody>
        <BoardRow ticket={makeTicket()} ticketIdx={0} isChecked={false} isSelected={false} someChecked={false} isDragActive={false} tags={ALL_TAGS} warningLabels={[]} selectedTicket={null} onSelectTicket={vi.fn()} onCheckboxClick={vi.fn()} />
      </tbody></table>,
    );
    expect(screen.queryByText("No story point estimate")).toBeNull();
  });

  it("width-gates the label cluster (hidden until the container is wide enough)", () => {
    // jsdom can't evaluate container queries, so assert the display-toggle gating class is
    // present: the cluster is `hidden` and only reveals at the @[52rem]/boardrow breakpoint,
    // so it reserves no space on narrow rows.
    renderRow({ warningLabels: ["No story point estimate"] });
    const labelEl = screen.getByText("No story point estimate");
    const cluster = labelEl.parentElement!;
    expect(cluster.className).toContain("hidden");
    expect(cluster.className).toContain("@[52rem]/boardrow:inline-flex");
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
});
