import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CaptionButton } from "./CaptionButton";

describe("CaptionButton", () => {
  it("renders its label and fires onClick", () => {
    const onClick = vi.fn();
    render(<CaptionButton onClick={onClick}>Edit</CaptionButton>);
    const btn = screen.getByRole("button", { name: "Edit" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn).toHaveClass("cursor-pointer");
  });

  it("applies the brand-tinted ring when active", () => {
    render(
      <CaptionButton onClick={() => {}} variant="chip" active>
        Draft
      </CaptionButton>,
    );
    expect(screen.getByRole("button", { name: "Draft" }).className).toContain("ring-1");
  });

  it("gives chip variant a base fill when inactive", () => {
    render(
      <CaptionButton onClick={() => {}} variant="chip">
        Saved
      </CaptionButton>,
    );
    expect(screen.getByRole("button", { name: "Saved" }).className).toContain("bg-overlay-subtle");
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <CaptionButton onClick={onClick} disabled>
        Skip
      </CaptionButton>,
    );
    const btn = screen.getByRole("button", { name: "Skip" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards data-testid and title", () => {
    render(
      <CaptionButton onClick={() => {}} data-testid="cb" title="tip">
        X
      </CaptionButton>,
    );
    const btn = screen.getByTestId("cb");
    expect(btn).toHaveAttribute("title", "tip");
  });
});
