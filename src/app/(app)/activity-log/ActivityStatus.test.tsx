import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ActivityStatus } from "./ActivityStatus";

describe("ActivityStatus", () => {
  it("renders the success label", () => {
    render(<ActivityStatus status="success" />);
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("renders the failed label", () => {
    render(<ActivityStatus status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders the cancelled label", () => {
    render(<ActivityStatus status="cancelled" />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("renders the running label with a spinning icon", () => {
    const { container } = render(<ActivityStatus status="running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });
});
