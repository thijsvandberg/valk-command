import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BreakdownBoard } from "./BreakdownBoard";
import type { EpicChildCardWithSprint } from "@/types/epic-writer";

// Created-card keys render as TicketRefPill (BRDG-487 #9), which fetches via SWR;
// stub it so the board tests stay off the network but still assert the key.
vi.mock("@/components/shared/TicketRefPill", () => ({
  TicketRefPill: ({ ticketKey }: { ticketKey: string }) => <span>{ticketKey}</span>,
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
});
