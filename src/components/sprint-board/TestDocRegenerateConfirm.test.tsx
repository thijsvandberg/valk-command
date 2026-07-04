import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Ticket } from "@/types/ticket";

// The board pill pulls in heavy dropdown/hover machinery; a light stub keeps the
// test focused on the confirm modal's own behaviour (rows + checkboxes + proceed).
vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, jiraStatus }: { ticketKey: string; jiraStatus: string }) => (
    <span data-testid="ticket-pill">{ticketKey} {jiraStatus}</span>
  ),
}));

import { TestDocRegenerateConfirm } from "./TestDocRegenerateConfirm";

const TICKETS: Pick<Ticket, "key" | "title" | "type" | "jiraStatus">[] = [
  { key: "VPL-1", title: "First open thing", type: "story", jiraStatus: "TO DO" },
  { key: "VPL-2", title: "Second open thing", type: "bug", jiraStatus: "IN PROGRESS" },
];

function renderConfirm(overrides: Partial<Parameters<typeof TestDocRegenerateConfirm>[0]> = {}) {
  const props = { tickets: TICKETS, onCancel: vi.fn(), onProceed: vi.fn(), ...overrides };
  render(<TestDocRegenerateConfirm {...props} />);
  return props;
}

describe("TestDocRegenerateConfirm (BRDG-465)", () => {
  it("titles with the count and lists each ticket as a row: pill + status + title", () => {
    renderConfirm();
    expect(screen.getByText('2 tickets marked "no test doc needed"')).toBeInTheDocument();
    expect(screen.getAllByTestId("ticket-pill").map((p) => p.textContent)).toEqual([
      "VPL-1 TO DO",
      "VPL-2 IN PROGRESS",
    ]);
    expect(screen.getByText("First open thing")).toBeInTheDocument();
    expect(screen.getByText("Second open thing")).toBeInTheDocument();
  });

  it("uses the singular in the title for a single ticket", () => {
    renderConfirm({ tickets: [TICKETS[0]] });
    expect(screen.getByText('1 ticket marked "no test doc needed"')).toBeInTheDocument();
  });

  it("offers no include-all action", () => {
    renderConfirm();
    expect(screen.queryByText("Include them")).not.toBeInTheDocument();
  });

  it("Continue with nothing ticked proceeds with an empty include list", () => {
    const props = renderConfirm();
    fireEvent.click(screen.getByText("Continue"));
    expect(props.onProceed).toHaveBeenCalledWith([]);
  });

  it("Continue includes exactly the ticked tickets", () => {
    const props = renderConfirm();
    fireEvent.click(screen.getByRole("checkbox", { name: "Regenerate VPL-2 anyway" }));
    fireEvent.click(screen.getByText("Continue"));
    expect(props.onProceed).toHaveBeenCalledWith(["VPL-2"]);
  });

  it("un-ticking removes a ticket from the include list again", () => {
    const props = renderConfirm();
    const box = screen.getByRole("checkbox", { name: "Regenerate VPL-1 anyway" });
    fireEvent.click(box);
    fireEvent.click(box);
    fireEvent.click(screen.getByText("Continue"));
    expect(props.onProceed).toHaveBeenCalledWith([]);
  });

  it("Cancel calls onCancel", () => {
    const props = renderConfirm();
    fireEvent.click(screen.getByText("Cancel"));
    expect(props.onCancel).toHaveBeenCalled();
  });
});
