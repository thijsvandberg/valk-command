import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChildStoryCard } from "./ChildStoryCard";
import type { EpicChildDraftRow } from "@/db/schema";

function card(overrides: Partial<EpicChildDraftRow>): EpicChildDraftRow {
  return {
    id: overrides.id ?? "c1",
    sessionId: "sess-1",
    cardIndex: 0,
    title: "Card title",
    bullets: ["a bullet"],
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

describe("ChildStoryCard", () => {
  it("offers a Deepen action and calls back with the card index and title", () => {
    const onDeepen = vi.fn();
    render(<ChildStoryCard card={card({ cardIndex: 2, title: "Cart summary" })} onDeepen={onDeepen} />);

    fireEvent.click(screen.getByRole("button", { name: /deepen/i }));
    expect(onDeepen).toHaveBeenCalledWith(2, "Cart summary");
  });

  it("labels the action Refine once a body exists", () => {
    render(<ChildStoryCard card={card({ body: "Worked out" })} onDeepen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /refine/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^deepen$/i })).not.toBeInTheDocument();
  });

  it("shows the Full depth badge once a body is filled", () => {
    render(<ChildStoryCard card={card({ body: "Full description" })} />);
    expect(screen.getByTitle("Depth: Full")).toBeInTheDocument();
  });

  it("disables the deepen action while a task is busy", () => {
    render(<ChildStoryCard card={card({})} onDeepen={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: /deepen/i })).toBeDisabled();
  });

  it("expands the worked-out body and persists an edit on blur", async () => {
    const onEditBody = vi.fn();
    render(<ChildStoryCard card={card({ cardIndex: 1, body: "Original body" })} onEditBody={onEditBody} />);

    // Body is collapsed by default; expand it.
    fireEvent.click(screen.getByRole("button", { name: /show detail/i }));
    expect(screen.getByText("Original body")).toBeInTheDocument();

    // Click the body region to edit, change it, blur to commit.
    fireEvent.click(screen.getByText("Original body"));
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Edited body" } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(onEditBody).toHaveBeenCalledWith(1, "Edited body"));
  });

  it("does not call onEditBody when the body is unchanged", async () => {
    const onEditBody = vi.fn();
    render(<ChildStoryCard card={card({ body: "Same" })} onEditBody={onEditBody} />);
    fireEvent.click(screen.getByRole("button", { name: /show detail/i }));
    fireEvent.click(screen.getByText("Same"));
    const textarea = await screen.findByRole("textbox");
    fireEvent.blur(textarea);
    expect(onEditBody).not.toHaveBeenCalled();
  });
});
