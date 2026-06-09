import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { IssueTypeOption } from "./IssueTypeOption";

describe("IssueTypeOption", () => {
  it("renders the type label and an icon", () => {
    const { container } = render(<IssueTypeOption value="story" />);
    expect(screen.getByText("story")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the subtask option", () => {
    render(<IssueTypeOption value="subtask" />);
    expect(screen.getByText("subtask")).toBeInTheDocument();
  });

  it("renders an unknown type label without crashing", () => {
    render(<IssueTypeOption value="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});
