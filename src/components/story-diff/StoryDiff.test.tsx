import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StoryDiff } from "./StoryDiff";

describe("StoryDiff", () => {
  it("renders additions with green gutter marker", () => {
    const { container } = render(
      <StoryDiff oldText="hello world" newText="hello beautiful world" />,
    );

    const markers = container.querySelectorAll("[data-marker='insert']");
    expect(markers.length).toBeGreaterThan(0);
  });

  it("renders deletions with red gutter marker", () => {
    const { container } = render(
      <StoryDiff oldText="remove this word" newText="remove word" />,
    );

    const markers = container.querySelectorAll("[data-marker='delete']");
    expect(markers.length).toBeGreaterThan(0);
  });

  it("renders word-level highlights for modified lines", () => {
    const { container } = render(
      <StoryDiff oldText="the quick brown fox" newText="the slow brown fox" />,
    );

    // Word-level highlight spans have colored backgrounds
    const highlighted = container.querySelectorAll(
      'span[style*="rgba(46, 160, 80"]',
    );
    expect(highlighted.length).toBeGreaterThan(0);
  });

  it("handles empty old text (all insertions)", () => {
    const { container } = render(
      <StoryDiff oldText="" newText="brand new content" />,
    );

    const diff = container.querySelector('[data-testid="story-diff"]');
    expect(diff).toBeTruthy();
    const markers = container.querySelectorAll("[data-marker='insert']");
    expect(markers.length).toBeGreaterThan(0);
  });

  it("handles empty new text (all deletions)", () => {
    const { container } = render(
      <StoryDiff oldText="deleted content" newText="" />,
    );

    const diff = container.querySelector('[data-testid="story-diff"]');
    expect(diff).toBeTruthy();
    const markers = container.querySelectorAll("[data-marker='delete']");
    expect(markers.length).toBeGreaterThan(0);
  });

  it("shows no-changes message for identical strings", () => {
    render(<StoryDiff oldText="identical" newText="identical" />);
    expect(screen.getByTestId("story-diff-identical")).toBeTruthy();
    expect(screen.getByText("No changes between versions.")).toBeTruthy();
  });

  it("handles both empty strings", () => {
    render(<StoryDiff oldText="" newText="" />);
    expect(screen.getByTestId("story-diff-empty")).toBeTruthy();
    expect(screen.getByText("No content in either version.")).toBeTruthy();
  });

  it("reports stats via onStatsComputed callback", () => {
    const onStats = vi.fn();
    render(
      <StoryDiff oldText="old" newText="new" onStatsComputed={onStats} />,
    );
    expect(onStats).toHaveBeenCalledWith(
      expect.objectContaining({ added: 0, removed: 0, modified: 1, changeHunkCount: 1, decidedCount: 0 }),
    );
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
    expect(container.querySelector(".grid-cols-2")).toBeTruthy();
    expect(screen.getAllByText("v1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("v2").length).toBeGreaterThanOrEqual(1);
  });

  it("defaults to unified mode (no grid columns)", () => {
    const { container } = render(
      <StoryDiff oldText="old text" newText="new text" oldLabel="v1" newLabel="v2" />,
    );

    const diffEl = container.querySelector('[data-testid="story-diff"]');
    expect(diffEl).toBeTruthy();
    expect(container.querySelector(".grid-cols-2")).toBeNull();
  });

  it("reports added/modified stats via callback", () => {
    const onStats = vi.fn();
    render(
      <StoryDiff
        oldText="line one\nline two\nline three"
        newText="line one\nline changed\nline three\nnew line"
        onStatsComputed={onStats}
      />,
    );

    expect(onStats).toHaveBeenCalledWith(
      expect.objectContaining({ modified: expect.any(Number) }),
    );
  });

  it("shows collapsed unchanged lines", () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const newLines = oldLines.replace("line 10", "CHANGED");

    render(<StoryDiff oldText={oldLines} newText={newLines} />);

    expect(screen.getAllByText(/Show \d+ unchanged lines?/).length).toBeGreaterThan(0);
  });

  it("hides line numbers by default and shows them after toggle", async () => {
    const { container } = render(
      <StoryDiff oldText="first\nsecond" newText="first\nchanged" />,
    );

    // Line numbers hidden by default
    expect(container.querySelectorAll(".text-text-muted").length).toBe(0);

    // Clicking the # toggle reveals them
    const toggle = screen.getByTitle("Show line numbers");
    toggle.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelectorAll(".text-text-muted").length).toBeGreaterThan(0);
  });
});
