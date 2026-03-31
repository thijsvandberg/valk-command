import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SprintInsights } from "./SprintInsights";

describe("SprintInsights", () => {
  it("renders all insight categories", () => {
    render(<SprintInsights />);

    expect(screen.getByText("Stale Stories")).toBeTruthy();
    expect(screen.getByText("Unreviewed")).toBeTruthy();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("Avg Quality")).toBeTruthy();
  });

  it("shows the sprint insights header", () => {
    render(<SprintInsights />);
    expect(screen.getByText("Sprint Insights")).toBeTruthy();
  });

  it("collapses and expands on click", () => {
    render(<SprintInsights />);

    // Initially expanded - insight categories visible
    expect(screen.getByText("Stale Stories")).toBeTruthy();

    // Click to collapse
    fireEvent.click(screen.getByText("Sprint Insights"));

    // Categories should be hidden
    expect(screen.queryByText("Stale Stories")).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByText("Sprint Insights"));

    // Categories visible again
    expect(screen.getByText("Stale Stories")).toBeTruthy();
  });

  it("displays numeric values for insights", () => {
    render(<SprintInsights />);

    // Check that at least some numeric values are rendered
    const container = document.querySelector(".grid");
    expect(container).toBeTruthy();
    expect(container!.textContent).toMatch(/\d+/);
  });
});
