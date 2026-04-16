import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import TestCenterPage from "./page";

describe("TestCenterPage", () => {
  it("renders without crashing", () => {
    render(<TestCenterPage />);
    // Page renders the background gradient container; title is set via usePageTitle
    expect(document.title).toContain("Test Center");
  });

  it("sets the document title", () => {
    render(<TestCenterPage />);
    expect(document.title).toContain("Test Center");
  });
});
