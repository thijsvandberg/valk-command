import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import RefinementPage from "./page";

describe("RefinementPage", () => {
  it("renders the page title", () => {
    render(<RefinementPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Refinement");
  });

  it("renders a description", () => {
    render(<RefinementPage />);
    expect(screen.getByText(/backlog preparation view/i)).toBeInTheDocument();
  });
});
