import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PlaceholderRow } from "./PlaceholderRow";
import type { PlaceholderTicket } from "@/types/ticket";

const BASE: PlaceholderTicket = {
  id: "PLH-1",
  title: "Future work",
  description: "",
  type: "story",
  sprintId: "42",
  sprintName: "Sprint 42",
  epicKey: null,
  epic: null,
  businessValue: null,
  guestimation: null,
  status: "active",
  promotedToKey: null,
  createdAt: "2026-06-10T00:00:00Z",
  updatedAt: "2026-06-10T00:00:00Z",
};

function setup(overrides: Partial<PlaceholderTicket> = {}) {
  const onUpdate = vi.fn<(id: string, patch: Partial<PlaceholderTicket>) => void>();
  const onDelete = vi.fn<(id: string) => void>();
  const onPromote = vi.fn<(id: string) => void>();
  const utils = render(
    <PlaceholderRow
      placeholder={{ ...BASE, ...overrides }}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onPromote={onPromote}
    />,
  );
  return { onUpdate, onDelete, onPromote, ...utils };
}

describe("PlaceholderRow", () => {
  it("renders the provisional 'Placeholder' badge and the title", () => {
    setup();
    expect(screen.getByText("Placeholder")).toBeInTheDocument();
    expect(screen.getByText("Future work")).toBeInTheDocument();
  });

  it("exposes NO Jira status/assignee controls (placeholders are not real tickets)", () => {
    setup();
    // No status pill / assignee picker; only the edit, estimate, BV and action buttons.
    expect(screen.queryByRole("button", { name: /status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assignee/i })).not.toBeInTheDocument();
  });

  it("opens an inline editor and saves a new title + description", () => {
    const { onUpdate } = setup();
    fireEvent.click(screen.getByTitle("Edit placeholder content"));

    const title = screen.getByPlaceholderText("Placeholder title") as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Renamed" } });
    const desc = screen.getByPlaceholderText("Notes / description (optional)") as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: "some notes" } });

    fireEvent.click(screen.getByText("Save"));
    expect(onUpdate).toHaveBeenCalledWith("PLH-1", { title: "Renamed", description: "some notes" });
  });

  it("does not call onUpdate when nothing changed", () => {
    const { onUpdate } = setup();
    fireEvent.click(screen.getByTitle("Edit placeholder content"));
    fireEvent.click(screen.getByText("Save"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("fires onPromote and onDelete from the row actions", () => {
    const { onPromote, onDelete } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Promote placeholder to a real ticket" }));
    expect(onPromote).toHaveBeenCalledWith("PLH-1");
    fireEvent.click(screen.getByRole("button", { name: "Delete placeholder" }));
    expect(onDelete).toHaveBeenCalledWith("PLH-1");
  });

  it("shows a guess-only estimate (no 'Commit as story points' action)", () => {
    setup({ guestimation: 5 });
    // The guestimation chip is present...
    const chip = screen.getByRole("button", { name: "Guestimate: 5" });
    fireEvent.click(chip);
    // ...but the commit-to-SP affordance from planning mode is suppressed.
    expect(screen.queryByText("Commit as story points")).not.toBeInTheDocument();
  });

  it("shows a notes indicator when a description is present", () => {
    const { container } = setup({ description: "has notes" });
    expect(within(container).getByTitle("has notes")).toBeInTheDocument();
  });
});
