import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TestCenterPage from "./page";

describe("TestCenterPage", () => {
  it("renders the page title", () => {
    render(<TestCenterPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Test Center");
  });

  it("renders a description", () => {
    render(<TestCenterPage />);
    expect(screen.getByText(/test status overview/i)).toBeInTheDocument();
  });
});
