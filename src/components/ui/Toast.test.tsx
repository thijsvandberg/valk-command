import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders nothing when there is no toast", () => {
    const { container } = render(<Toast toast={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the content with role=status", () => {
    render(<Toast toast="Saved" onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows a dismiss button by default and calls onDismiss when clicked", () => {
    const onDismiss = vi.fn();
    render(<Toast toast="Saved" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner and hides the dismiss button while loading", () => {
    const { container } = render(<Toast toast="Working..." loading onDismiss={() => {}} />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dismiss")).toBeNull();
  });

  it("accepts rich ReactNode content", () => {
    render(
      <Toast
        toast={<span>Moved <a href="/sprint">View on sprint board</a></span>}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "View on sprint board" })).toBeInTheDocument();
  });
});
