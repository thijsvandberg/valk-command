import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PanelHeader } from "./PanelHeader";

describe("PanelHeader", () => {
  it("renders the label", () => {
    render(<PanelHeader label="Last 24 Hours" />);
    expect(screen.getByText("Last 24 Hours")).toBeInTheDocument();
  });

  it("renders icon and meta slots", () => {
    render(
      <PanelHeader
        label="Recurring Failures"
        icon={<svg data-testid="panel-icon" />}
        meta={<span data-testid="panel-meta">3</span>}
      />,
    );
    expect(screen.getByTestId("panel-icon")).toBeInTheDocument();
    expect(screen.getByTestId("panel-meta")).toBeInTheDocument();
  });

  it("applies warning tone color to the label", () => {
    render(<PanelHeader label="Warned" tone="warning" />);
    expect(screen.getByText("Warned").className).toContain("text-amber-400/70");
  });

  it("applies default tone color to the label", () => {
    render(<PanelHeader label="Normal" />);
    expect(screen.getByText("Normal").className).toContain("text-text-muted");
  });
});
