import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AddEpicPill } from "./AddEpicPill";
import type { EpicOption } from "./EpicPicker";

// Stub the heavy picker: assert AddEpicPill forwards the ghost empty-state config
// and the change callback, without pulling in SWR/streaming.
vi.mock("./EpicPicker", () => ({
  EpicPicker: (props: {
    value: EpicOption | null;
    onChange: (e: EpicOption | null) => void;
    ticketKey?: string;
    emptyLabel?: string;
    emptyTriggerClassName?: string;
  }) => (
    <button
      data-testid="epic-picker"
      data-value={String(props.value)}
      data-ticket={props.ticketKey}
      data-empty-label={props.emptyLabel}
      data-has-ghost-class={String(Boolean(props.emptyTriggerClassName))}
      onClick={() => props.onChange({ key: "VPL-100", name: "Onboarding" })}
    >
      picker
    </button>
  ),
}));

describe("AddEpicPill", () => {
  it("renders an empty epic picker labelled 'Add epic' for the given ticket", () => {
    render(<AddEpicPill ticketKey="VPL-1" onChange={vi.fn()} />);
    const picker = screen.getByTestId("epic-picker");
    expect(picker.getAttribute("data-value")).toBe("null");
    expect(picker.getAttribute("data-ticket")).toBe("VPL-1");
    expect(picker.getAttribute("data-empty-label")).toBe("Add epic");
    expect(picker.getAttribute("data-has-ghost-class")).toBe("true");
  });

  it("forwards the chosen epic to onChange", () => {
    const onChange = vi.fn();
    render(<AddEpicPill ticketKey="VPL-1" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("epic-picker"));
    expect(onChange).toHaveBeenCalledWith({ key: "VPL-100", name: "Onboarding" });
  });

  it("does not bubble clicks to the surrounding row", () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <AddEpicPill ticketKey="VPL-1" onChange={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId("epic-picker"));
    expect(rowClick).not.toHaveBeenCalled();
  });
});
