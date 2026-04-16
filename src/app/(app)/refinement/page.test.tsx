import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import RefinementPage from "./page";

describe("RefinementPage", () => {
  it("renders without crashing", () => {
    render(<RefinementPage />);
    // Page renders the background gradient container; title is set via usePageTitle
    expect(document.title).toContain("Refinement");
  });

  it("sets the document title", () => {
    render(<RefinementPage />);
    expect(document.title).toContain("Refinement");
  });
});
