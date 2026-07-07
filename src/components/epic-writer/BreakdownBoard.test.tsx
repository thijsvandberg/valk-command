import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BreakdownBoard } from "./BreakdownBoard";
import type { EpicChildCardWithSprint } from "@/types/epic-writer";

// Created-card keys render as TicketRefPill (BRDG-487 #9), which fetches via SWR;
// stub it so the board tests stay off the network but still assert the key.
vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => <span>{ticketKey}</span>,
}));

// The placement control / card create menus lazy-load sprints + the default-
// sprint setting when opened (SprintPlacementMenu); stub those so the board
// tests stay isolated from the network.
vi.mock("@/lib/api-client", () => ({
  jira: {
    getSprints: vi
      .fn()
      .mockResolvedValue([{ id: "42", name: "Sprint 42", state: "active" }]),
  },
  settings: { getDefaultSprint: vi.fn().mockResolvedValue({ sprintId: "" }) },
}));

function card(overrides: Partial<EpicChildCardWithSprint>): EpicChildCardWithSprint {
  return {
    id: overrides.id ?? "c1",
    sessionId: "sess-1",
    cardIndex: 0,
    title: "Card title",
    bullets: [],
    body: null,
    status: "draft",
    jiraKey: null,
    suggestedSprintId: null,
    suggestedLinks: [],
    liveSprintId: null,
    liveSprintName: null,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("BreakdownBoard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an empty state when there are no cards", () => {
    render(<BreakdownBoard cards={[]} />);
    expect(screen.getByText(/Turn this epic into child stories/i)).toBeInTheDocument();
  });

  it("offers a Generate breakdown action on the empty board and calls it on click", () => {
    const onGenerateBreakdown = vi.fn();
    render(<BreakdownBoard cards={[]} onGenerateBreakdown={onGenerateBreakdown} />);

    const cta = screen.getByRole("button", { name: /generate breakdown/i });
    fireEvent.click(cta);
    expect(onGenerateBreakdown).toHaveBeenCalledTimes(1);
  });

  // BRDG-491 #1: the empty-board Generate breakdown follows the shared send/stage
  // model - the label stages the prompt; the paper-plane arrow generates now.
  it("stages via the label and generates via the split arrow", () => {
    const onGenerateBreakdown = vi.fn();
    const onStageGenerate = vi.fn();
    render(
      <BreakdownBoard
        cards={[]}
        onGenerateBreakdown={onGenerateBreakdown}
        onStageGenerate={onStageGenerate}
      />,
    );
    // Label stages, does not generate.
    fireEvent.click(screen.getByRole("button", { name: /generate breakdown/i }));
    expect(onStageGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerateBreakdown).not.toHaveBeenCalled();

    // Arrow generates now.
    fireEvent.click(screen.getByRole("button", { name: /generate the breakdown now/i }));
    expect(onGenerateBreakdown).toHaveBeenCalledTimes(1);
  });

  it("disables the CTA and shows a generating state while a turn runs", () => {
    render(<BreakdownBoard cards={[]} onGenerateBreakdown={vi.fn()} busy />);

    const cta = screen.getByRole("button", { name: /generating breakdown/i });
    expect(cta).toBeDisabled();
  });

  it("does not render the empty-state CTA once cards exist", () => {
    render(
      <BreakdownBoard cards={[card({ title: "Existing" })]} onGenerateBreakdown={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /generate breakdown/i })).not.toBeInTheDocument();
  });

  it("renders a card per child story with its bullets", () => {
    render(
      <BreakdownBoard
        cards={[
          card({ id: "a", cardIndex: 0, title: "Cart summary", bullets: ["Show items", "Show total"] }),
          card({ id: "b", cardIndex: 1, title: "Coupon flow", bullets: ["Apply coupon"] }),
        ]}
      />,
    );

    expect(screen.getByText("Cart summary")).toBeInTheDocument();
    expect(screen.getByText("Show items")).toBeInTheDocument();
    expect(screen.getByText("Coupon flow")).toBeInTheDocument();
    expect(screen.getByText("2 stories")).toBeInTheDocument();
  });

  // BRDG-490 #2: the depth + draft state are folded into one merged status badge.
  it("shows a 'Draft · Bullets' status for a title+bullets card", () => {
    render(<BreakdownBoard cards={[card({ bullets: ["one bullet"] })]} />);
    expect(screen.getByText("Draft · Bullets")).toBeInTheDocument();
  });

  it("shows a plain 'Draft' status when a card has no bullets yet", () => {
    render(<BreakdownBoard cards={[card({ bullets: [] })]} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows a 'Draft · Full' status once a body is filled (refine phase)", () => {
    render(<BreakdownBoard cards={[card({ bullets: ["b"], body: "Full description" })]} />);
    expect(screen.getByText("Draft · Full")).toBeInTheDocument();
  });

  it("shows a Draft marker for local cards and the Jira key once created", () => {
    render(
      <BreakdownBoard
        cards={[
          card({ id: "a", cardIndex: 0, title: "Local", status: "draft" }),
          card({ id: "b", cardIndex: 1, title: "Live", status: "created", jiraKey: "VPL-500" }),
        ]}
      />,
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("VPL-500")).toBeInTheDocument();
  });

  // BRDG-490 #1: Collapse all / Expand all is the board-wide master for the
  // per-card collapse; it hides every card's bullets/detail.
  it("collapses all cards to titles and expands them back", () => {
    render(
      <BreakdownBoard
        cards={[card({ id: "a", cardIndex: 0, title: "Cart summary", bullets: ["Show items"] })]}
      />,
    );
    // Expanded by default: bullets visible, button offers "Collapse all".
    expect(screen.getByText("Show items")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /collapse all/i }));

    // Now collapsed: bullets hidden, button offers "Expand all".
    expect(screen.queryByText("Show items")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));
    expect(screen.getByText("Show items")).toBeInTheDocument();
  });

  // BRDG-490 #1: a single card collapses on its own without affecting the others.
  it("collapses one card independently, leaving the others expanded", () => {
    render(
      <BreakdownBoard
        cards={[
          card({ id: "a", cardIndex: 0, title: "One", bullets: ["bullet A"] }),
          card({ id: "b", cardIndex: 1, title: "Two", bullets: ["bullet B"] }),
        ]}
      />,
    );
    expect(screen.getByText("bullet A")).toBeInTheDocument();
    expect(screen.getByText("bullet B")).toBeInTheDocument();

    // Collapse only the first card.
    const collapseButtons = screen.getAllByRole("button", { name: /collapse card/i });
    fireEvent.click(collapseButtons[0]);

    expect(screen.queryByText("bullet A")).not.toBeInTheDocument();
    expect(screen.getByText("bullet B")).toBeInTheDocument();
  });

  // BRDG-487 #10: a drag handle per card appears only when reordering is enabled.
  it("renders a drag handle per card when onReorder is provided", () => {
    render(
      <BreakdownBoard
        cards={[
          card({ id: "a", cardIndex: 0, title: "One" }),
          card({ id: "b", cardIndex: 1, title: "Two" }),
        ]}
        onReorder={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button", { name: /drag to reorder/i })).toHaveLength(2);
  });

  it("does not render drag handles when the board is not reorderable", () => {
    render(<BreakdownBoard cards={[card({ id: "a", cardIndex: 0, title: "One" })]} />);
    expect(screen.queryByRole("button", { name: /drag to reorder/i })).not.toBeInTheDocument();
  });

  // BRDG-500 #3: Create all promotes every remaining DRAFT card, skipping ones
  // already created, using the epic's configured placement.
  it("Create all promotes every DRAFT card with the configured placement and skips created ones", async () => {
    const onCreateInJira = vi.fn().mockResolvedValue(undefined);
    render(
      <BreakdownBoard
        cards={[
          card({ id: "a", cardIndex: 0, title: "One", status: "draft" }),
          card({ id: "b", cardIndex: 1, title: "Two", status: "created", jiraKey: "VPL-1" }),
          card({ id: "c", cardIndex: 2, title: "Three", status: "draft" }),
        ]}
        onCreateInJira={onCreateInJira}
        childPlacement="42"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /create all/i }));
    await waitFor(() => expect(onCreateInJira).toHaveBeenCalledTimes(2));
    expect(onCreateInJira).toHaveBeenCalledWith(0, "42");
    expect(onCreateInJira).toHaveBeenCalledWith(2, "42");
    expect(onCreateInJira).not.toHaveBeenCalledWith(1, expect.anything());
  });

  // BRDG-500 #3: with no epic placement set, Create all falls back to the global
  // default so it always works without forcing configuration first.
  it("Create all falls back to the default placement when the epic setting is unset", async () => {
    const onCreateInJira = vi.fn().mockResolvedValue(undefined);
    render(
      <BreakdownBoard
        cards={[card({ id: "a", cardIndex: 0, status: "draft" })]}
        onCreateInJira={onCreateInJira}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /create all/i }));
    await waitFor(() => expect(onCreateInJira).toHaveBeenCalledWith(0, "__default__"));
  });

  it("hides Create all when no DRAFT cards remain", () => {
    render(
      <BreakdownBoard
        cards={[card({ id: "a", cardIndex: 0, status: "created", jiraKey: "VPL-1" })]}
        onCreateInJira={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /create all/i })).not.toBeInTheDocument();
  });

  // BRDG-500 #4: Confirm all confirms only links whose both ends are created.
  it("Confirm all confirms every link whose both ends are created and leaves the rest", async () => {
    const onConfirmLink = vi.fn().mockResolvedValue(undefined);
    render(
      <BreakdownBoard
        cards={[
          card({
            id: "a",
            cardIndex: 0,
            status: "created",
            jiraKey: "VPL-1",
            suggestedLinks: [{ targetIndex: 1, relation: "blocks", confirmed: false }],
          }),
          card({
            id: "b",
            cardIndex: 1,
            status: "created",
            jiraKey: "VPL-2",
            suggestedLinks: [{ targetIndex: 2, relation: "relates to", confirmed: false }],
          }),
          card({ id: "c", cardIndex: 2, status: "draft" }),
        ]}
        onConfirmLink={onConfirmLink}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm all/i }));
    // Only 0 -> 1 is confirmable; 1 -> 2 targets a still-DRAFT card.
    await waitFor(() => expect(onConfirmLink).toHaveBeenCalledTimes(1));
    expect(onConfirmLink).toHaveBeenCalledWith(0, 1, "blocks");
  });

  it("hides Confirm all when nothing is confirmable", () => {
    render(
      <BreakdownBoard
        cards={[
          card({
            id: "a",
            cardIndex: 0,
            status: "created",
            jiraKey: "VPL-1",
            suggestedLinks: [{ targetIndex: 1, relation: "blocks", confirmed: false }],
          }),
        ]}
        onConfirmLink={vi.fn()}
      />,
    );
    // Target index 1 is not a created card, so there is nothing to confirm.
    expect(screen.queryByRole("button", { name: /confirm all/i })).not.toBeInTheDocument();
  });

  // BRDG-500 #5: Deepen all works out every not-yet-full card in one turn.
  it("Deepen all calls onDeepenAll when at least one card is not full", () => {
    const onDeepenAll = vi.fn();
    render(
      <BreakdownBoard
        cards={[card({ id: "a", cardIndex: 0, bullets: ["b"], body: null })]}
        onDeepenAll={onDeepenAll}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /deepen all/i }));
    expect(onDeepenAll).toHaveBeenCalledTimes(1);
  });

  it("hides Deepen all when every card is already full", () => {
    render(
      <BreakdownBoard
        cards={[card({ id: "a", cardIndex: 0, bullets: ["b"], body: "Full body" })]}
        onDeepenAll={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /deepen all/i })).not.toBeInTheDocument();
  });

  // BRDG-500 #1: the header placement control sets the epic default.
  it("sets the epic placement from the header control", async () => {
    const onSetChildPlacement = vi.fn();
    render(
      <BreakdownBoard
        cards={[card({ id: "a", cardIndex: 0 })]}
        onSetChildPlacement={onSetChildPlacement}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /set placement/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /to be planned/i }));
    expect(onSetChildPlacement).toHaveBeenCalledWith("__backlog__");
  });

  it("resets the epic placement to choose-each-time", async () => {
    const onSetChildPlacement = vi.fn();
    render(
      <BreakdownBoard
        cards={[card({ id: "a", cardIndex: 0 })]}
        childPlacement="__backlog__"
        onSetChildPlacement={onSetChildPlacement}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new in backlog/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /choose each time/i }));
    expect(onSetChildPlacement).toHaveBeenCalledWith(null);
  });

  it("omits the placement control and bulk actions when their handlers are not provided", () => {
    render(<BreakdownBoard cards={[card({ id: "a", cardIndex: 0, bullets: ["b"] })]} />);
    expect(screen.queryByRole("button", { name: /set placement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deepen all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm all/i })).not.toBeInTheDocument();
  });
});
