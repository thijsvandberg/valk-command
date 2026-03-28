import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import JobsPage from "./page";

describe("JobsPage", () => {
  it("renders the page title", () => {
    render(<JobsPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Scheduled Jobs");
  });

  it("renders a description", () => {
    render(<JobsPage />);
    expect(screen.getByText(/manage recurring workspace tasks/i)).toBeInTheDocument();
  });
});
