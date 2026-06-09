import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EstimatePicker } from "./EstimatePicker";

// Convenience: render with sensible defaults and override per test.
function setup(props: Partial<React.ComponentProps<typeof EstimatePicker>> = {}) {
  const onStoryPointsChange = vi.fn();
  const onGuestimationChange = vi.fn();
  const utils = render(
    <EstimatePicker
      storyPoints={null}
      guestimation={null}
      onStoryPointsChange={onStoryPointsChange}
      onGuestimationChange={onGuestimationChange}
      planningMode
      {...props}
    />,
  );
  return { onStoryPointsChange, onGuestimationChange, ...utils };
}

describe("EstimatePicker — single chip display", () => {
  it("shows an unset chip labelled 'Set guestimate or story points' in planning mode", () => {
    setup();
    expect(screen.getByRole("button", { name: "Set guestimate or story points" })).toBeInTheDocument();
  });

  it("shows a solid SP chip (no dashed border) when story points are set", () => {
    setup({ storyPoints: 5, showMetricIcon: true });
    const trigger = screen.getByRole("button", { name: "Story Points: 5" });
    expect(trigger).toHaveTextContent("5");
    expect(trigger.className).not.toContain("border-dashed");
  });

  it("shows a dashed guess chip when only a planning guess is set", () => {
    setup({ guestimation: 3, showMetricIcon: true });
    const trigger = screen.getByRole("button", { name: "Guestimate: 3" });
    expect(trigger).toHaveTextContent("3");
    expect(trigger.className).toContain("border-dashed");
  });

  it("lets SP supersede the guess: shows only the SP value, never two chips", () => {
    setup({ storyPoints: 5, guestimation: 3, showMetricIcon: true });
    expect(screen.getByRole("button", { name: "Story Points: 5" })).toHaveTextContent("5");
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("hides the guess entirely when planning mode is off", () => {
    setup({ guestimation: 3, planningMode: false });
    // No guess chip; the cell reads as an unset story-point picker.
    expect(screen.getByRole("button", { name: "Set Story Points" })).toBeInTheDocument();
  });
});

describe("EstimatePicker — guess phase", () => {
  it("sets the guess (not SP) when picking a preset with no SP yet", () => {
    const { onGuestimationChange, onStoryPointsChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Set guestimate or story points" }));
    fireEvent.click(screen.getByRole("button", { name: "8" }));
    expect(onGuestimationChange).toHaveBeenCalledWith(8);
    expect(onStoryPointsChange).not.toHaveBeenCalled();
  });

  it("accepts a custom value past the preset scale (13+)", () => {
    const { onGuestimationChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Set guestimate or story points" }));
    fireEvent.click(screen.getByTitle("Custom value (13, 21, ...)"));
    const input = screen.getByPlaceholderText("13");
    fireEvent.change(input, { target: { value: "13" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onGuestimationChange).toHaveBeenCalledWith(13);
  });

  it("picks a value from the keyboard while open", () => {
    const { onGuestimationChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Set guestimate or story points" }));
    fireEvent.keyDown(document, { key: "3" });
    expect(onGuestimationChange).toHaveBeenCalledWith(3);
  });

  it("clears the guess with the reset button (distinct from N/A)", () => {
    const { onGuestimationChange } = setup({ guestimation: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Guestimate: 5" }));
    fireEvent.click(screen.getByTitle("Clear (not set)"));
    expect(onGuestimationChange).toHaveBeenCalledWith(null);
  });

  it("marks N/A as the value 0, not a clear", () => {
    const { onGuestimationChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Set guestimate or story points" }));
    fireEvent.click(screen.getByTitle("Not applicable"));
    expect(onGuestimationChange).toHaveBeenCalledWith(0);
  });
});

describe("EstimatePicker — commit (pencil to ink)", () => {
  it("commits an existing guess straight to SP, keeping it as the record", () => {
    const { onStoryPointsChange, onGuestimationChange } = setup({ guestimation: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Guestimate: 5" }));
    fireEvent.click(screen.getByRole("button", { name: /commit as story points/i }));
    expect(onStoryPointsChange).toHaveBeenCalledWith(5);
    // Unchanged guess of record -> no redundant write.
    expect(onGuestimationChange).not.toHaveBeenCalled();
  });

  it("leaves no guesstimate when a value entered from empty is committed straight away", () => {
    const { onStoryPointsChange, onGuestimationChange, rerender } = setup();
    // Open from empty (guess-at-open is null), then a pick lands the guess...
    fireEvent.click(screen.getByRole("button", { name: "Set guestimate or story points" }));
    rerender(
      <EstimatePicker
        storyPoints={null}
        guestimation={5}
        onStoryPointsChange={onStoryPointsChange}
        onGuestimationChange={onGuestimationChange}
        planningMode
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /commit as story points/i }));
    expect(onStoryPointsChange).toHaveBeenCalledWith(5);
    // ...and the phantom guess is dropped, because there was no prior guesstimate.
    expect(onGuestimationChange).toHaveBeenCalledWith(null);
  });

  it("preserves the earlier guess when you reopen, adjust, and commit", () => {
    const { onStoryPointsChange, onGuestimationChange, rerender } = setup({ guestimation: 3 });
    // Open on an existing guess of 3 (guess-at-open = 3), adjust to 5, then commit.
    fireEvent.click(screen.getByRole("button", { name: "Guestimate: 3" }));
    rerender(
      <EstimatePicker
        storyPoints={null}
        guestimation={5}
        onStoryPointsChange={onStoryPointsChange}
        onGuestimationChange={onGuestimationChange}
        planningMode
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /commit as story points/i }));
    expect(onStoryPointsChange).toHaveBeenCalledWith(5);
    // The earlier guess (3) is restored as the guesstimate of record, not the 5.
    expect(onGuestimationChange).toHaveBeenCalledWith(3);
  });
});

describe("EstimatePicker — committed (story-point) phase", () => {
  it("reverts a committed SP back to the preserved guess via 'back to guestimate'", () => {
    const { onStoryPointsChange } = setup({ storyPoints: 5, guestimation: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Story Points: 5" }));
    fireEvent.click(screen.getByRole("button", { name: /back to guestimate/i }));
    expect(onStoryPointsChange).toHaveBeenCalledWith(null);
  });

  it("names the preserved guess in the revert action", () => {
    setup({ storyPoints: 5, guestimation: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Story Points: 5" }));
    expect(screen.getByRole("button", { name: /back to guestimate/i })).toHaveTextContent("# 3");
  });

  it("edits story points directly when committed (no guess write)", () => {
    const { onStoryPointsChange, onGuestimationChange } = setup({ storyPoints: 5, guestimation: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Story Points: 5" }));
    fireEvent.click(screen.getByRole("button", { name: "8" }));
    expect(onStoryPointsChange).toHaveBeenCalledWith(8);
    expect(onGuestimationChange).not.toHaveBeenCalled();
  });

  it("offers no commit/revert actions when planning mode is off", () => {
    setup({ storyPoints: 5, planningMode: false });
    fireEvent.click(screen.getByRole("button", { name: "Story Points: 5" }));
    expect(screen.queryByRole("button", { name: /commit as story points/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to guestimate/i })).not.toBeInTheDocument();
  });
});
