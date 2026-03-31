import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StoryDiff } from "./StoryDiff";

describe("StoryDiff", () => {
  it("renders additions with green background", () => {
    const { container } = render(
      <StoryDiff oldText="hello world" newText="hello beautiful world" />,
    );

    const insertSpan = container.querySelector(
      'span[style*="rgba(46, 145, 73"]',
    );
    expect(insertSpan).toBeTruthy();
    expect(insertSpan!.textContent).toContain("beautiful");
  });

  it("renders deletions with red background and strikethrough", () => {
    const { container } = render(
      <StoryDiff oldText="remove this word" newText="remove word" />,
    );

    const deleteSpan = container.querySelector(
      'span[style*="rgba(229, 83, 75"]',
    );
    expect(deleteSpan).toBeTruthy();
    expect(deleteSpan!.className).toContain("line-through");
    expect(deleteSpan!.textContent).toContain("this ");
  });

  it("renders unchanged text without diff styling", () => {
    const { container } = render(
      <StoryDiff oldText="same text here" newText="same text changed" />,
    );

    const allSpans = container.querySelectorAll("span");
    const plainSpans = Array.from(allSpans).filter(
      (s) => !s.getAttribute("style") && !s.className.includes("line-through"),
    );
    const plainText = plainSpans.map((s) => s.textContent).join("");
    expect(plainText).toContain("same text ");
  });

  it("handles empty old text (all insertions)", () => {
    const { container } = render(
      <StoryDiff oldText="" newText="brand new content" />,
    );

    const insertDiv = container.querySelector(
      'div[style*="rgba(46, 145, 73"]',
    );
    expect(insertDiv).toBeTruthy();
    expect(insertDiv!.textContent).toContain("brand new content");
  });

  it("handles empty new text (all deletions)", () => {
    const { container } = render(
      <StoryDiff oldText="deleted content" newText="" />,
    );

    const deleteDiv = container.querySelector(
      'div[style*="rgba(229, 83, 75"]',
    );
    expect(deleteDiv).toBeTruthy();
    expect(deleteDiv!.textContent).toContain("deleted content");
  });

  it("shows no-changes message for identical strings", () => {
    render(<StoryDiff oldText="identical" newText="identical" />);

    expect(
      screen.getByTestId("story-diff-identical"),
    ).toBeTruthy();
    expect(screen.getByText("No changes between versions.")).toBeTruthy();
  });

  it("handles both empty strings", () => {
    render(<StoryDiff oldText="" newText="" />);

    expect(
      screen.getByTestId("story-diff-empty"),
    ).toBeTruthy();
    expect(screen.getByText("No content in either version.")).toBeTruthy();
  });

  it("renders labels when provided", () => {
    render(
      <StoryDiff
        oldText="old"
        newText="new"
        oldLabel="v1"
        newLabel="v2"
      />,
    );

    expect(screen.getByText("v1")).toBeTruthy();
    expect(screen.getByText("v2")).toBeTruthy();
  });

  it("renders side-by-side mode with two columns", () => {
    const { container } = render(
      <StoryDiff
        oldText="old content"
        newText="new content"
        oldLabel="v1"
        newLabel="v2"
        mode="side-by-side"
      />,
    );

    expect(container.querySelector('[data-testid="story-diff"]')).toBeTruthy();
    // Column headers should be present
    expect(screen.getByText("v1")).toBeTruthy();
    expect(screen.getByText("v2")).toBeTruthy();
  });

  it("defaults to unified mode", () => {
    const { container } = render(
      <StoryDiff
        oldText="old text"
        newText="new text"
        oldLabel="v1"
        newLabel="v2"
      />,
    );

    // In unified mode, labels are in a flex row with arrow, not as column headers
    const diffEl = container.querySelector('[data-testid="story-diff"]');
    expect(diffEl).toBeTruthy();
    // Unified mode does not use grid columns
    expect(container.querySelector(".grid-cols-2")).toBeNull();
  });

  it("side-by-side mode shows grid layout", () => {
    const { container } = render(
      <StoryDiff
        oldText="old paragraph"
        newText="new paragraph"
        mode="side-by-side"
      />,
    );

    expect(container.querySelector(".grid-cols-2")).toBeTruthy();
  });
});
