import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Events today" value="202" />);
    expect(screen.getByText("Events today")).toBeInTheDocument();
    expect(screen.getByText("202")).toBeInTheDocument();
  });

  it("renders the footer slot", () => {
    render(<StatCard label="Success rate" value="100%" footer={<span>+5%</span>} />);
    expect(screen.getByText("+5%")).toBeInTheDocument();
  });

  it("renders the icon slot", () => {
    render(<StatCard label="Errors" value="0" icon={<svg data-testid="stat-icon" />} />);
    expect(screen.getByTestId("stat-icon")).toBeInTheDocument();
  });

  it("merges additional className onto the card", () => {
    const { container } = render(<StatCard label="x" value="1" className="col-span-2" />);
    expect((container.firstChild as HTMLElement).className).toContain("col-span-2");
  });
});
