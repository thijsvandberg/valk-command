import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SprintBoardPage from "./page";

describe("SprintBoardPage", () => {
  it("renders the page title", () => {
    render(<SprintBoardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sprint Board");
  });

  it("renders a description", () => {
    render(<SprintBoardPage />);
    expect(screen.getByText(/jira tickets enriched with po metadata/i)).toBeInTheDocument();
  });
});
