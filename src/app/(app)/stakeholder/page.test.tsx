import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import StakeholderPage from "./page";

describe("StakeholderPage", () => {
  it("renders the page title", () => {
    render(<StakeholderPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Stakeholder View");
  });

  it("renders a description", () => {
    render(<StakeholderPage />);
    expect(screen.getByText(/read-only external view/i)).toBeInTheDocument();
  });
});
