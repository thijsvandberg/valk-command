import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BreakdownBoard } from "./BreakdownBoard";
import type { EpicChildDraftRow } from "@/db/schema";

function card(overrides: Partial<EpicChildDraftRow>): EpicChildDraftRow {
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
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("BreakdownBoard", () => {
  it("shows an empty state when there are no cards", () => {
    render(<BreakdownBoard cards={[]} />);
    expect(screen.getByText("No breakdown yet.")).toBeInTheDocument();
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

  it("shows the default depth badge (Bullets) for a title+bullets card", () => {
    render(<BreakdownBoard cards={[card({ bullets: ["one bullet"] })]} />);
    expect(screen.getByText("Bullets")).toBeInTheDocument();
  });

  it("shows the Title depth badge when a card has no bullets yet", () => {
    render(<BreakdownBoard cards={[card({ bullets: [] })]} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("shows the Full depth badge once a body is filled (detail phase)", () => {
    render(<BreakdownBoard cards={[card({ bullets: ["b"], body: "Full description" })]} />);
    expect(screen.getByText("Full")).toBeInTheDocument();
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
});
