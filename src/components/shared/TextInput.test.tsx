import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("renders an input element", () => {
    render(<TextInput placeholder="Search..." />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(
      <TextInput
        icon={<span data-testid="icon">I</span>}
        placeholder="Search..."
      />,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("adds left padding when icon is provided", () => {
    render(
      <TextInput
        icon={<span>I</span>}
        placeholder="Search..."
      />,
    );
    const input = screen.getByPlaceholderText("Search...");
    expect(input.className).toContain("pl-8");
  });

  it("applies sm size classes", () => {
    render(<TextInput inputSize="sm" placeholder="Small" />);
    const input = screen.getByPlaceholderText("Small");
    expect(input.className).toContain("text-xs");
  });

  it("merges additional className", () => {
    render(<TextInput className="font-mono" placeholder="Code" />);
    const input = screen.getByPlaceholderText("Code");
    expect(input.className).toContain("font-mono");
  });

  it("passes through HTML attributes", () => {
    render(<TextInput type="email" data-testid="email" placeholder="Email" />);
    expect(screen.getByTestId("email")).toHaveAttribute("type", "email");
  });
});
