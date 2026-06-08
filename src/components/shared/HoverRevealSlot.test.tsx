import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HoverRevealSlot } from "./HoverRevealSlot";

describe("HoverRevealSlot", () => {
  it("reveals on row hover at any width by default", () => {
    const { container } = render(
      <HoverRevealSlot>
        <span>child</span>
      </HoverRevealSlot>
    );
    const slot = container.querySelector("span");
    expect(slot?.className).toContain("group-hover/row:inline-flex");
    expect(slot?.className).not.toContain("@[45rem]/boardrow");
  });

  it("gates the reveal behind the row-width container query when hideWhenNarrow is set", () => {
    const { container } = render(
      <HoverRevealSlot hideWhenNarrow>
        <span>child</span>
      </HoverRevealSlot>
    );
    const slot = container.querySelector("span");
    // Below ~720px the row container query never matches, so the slot stays hidden.
    expect(slot?.className).toContain("@[45rem]/boardrow:group-hover/row:inline-flex");
  });

  it("stays revealed while focus is within (so an open picker's trigger never collapses)", () => {
    // A collapsed (display:none) trigger has a 0x0 rect, which would make the
    // open picker popover jump to the top-left corner (BRDG-303).
    const { container } = render(
      <HoverRevealSlot>
        <span>child</span>
      </HoverRevealSlot>
    );
    expect(container.querySelector("span")?.className).toContain("focus-within:inline-flex");
  });
});
