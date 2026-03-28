import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "./page";

describe("Landing page", () => {
  it("renders without crashing", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "valk-command",
    );
  });

  it("renders the CTA button", () => {
    render(<Home />);
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("renders all feature cards", () => {
    render(<Home />);
    expect(screen.getByText("Sprint Management")).toBeInTheDocument();
    expect(screen.getByText("AI Chat")).toBeInTheDocument();
    expect(screen.getByText("Test Oversight")).toBeInTheDocument();
  });
});
