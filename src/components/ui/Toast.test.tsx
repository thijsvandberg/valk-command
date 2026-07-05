import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Toast, ToastCard } from "./Toast";

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
    render(<Toast toast="Working..." loading onDismiss={() => {}} />);
    // Toast portals to <body>, so query the document rather than the render container.
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dismiss")).toBeNull();
  });

  it("portals to document.body (at z-notification) so it clears modal overlays", () => {
    const { container } = render(<Toast toast="Saved" onDismiss={() => {}} />);
    // Not left in the local render tree, where a positioned ancestor could trap it.
    expect(container.querySelector("[role='status']")).toBeNull();
    const toast = screen.getByRole("status");
    expect(document.body.contains(toast)).toBe(true);
    expect(toast.closest(".z-notification")).not.toBeNull();
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

describe("ToastCard (BRDG-430 shared toast body)", () => {
  it("applies the variant border tint", () => {
    const { container } = render(
      <ToastCard variant="error">Broken</ToastCard>,
    );
    expect((container.firstChild as HTMLElement).className).toContain("border-red-500/20");
  });

  it("renders role=alert with icon, actions and dismiss", () => {
    const onDismiss = vi.fn();
    render(
      <ToastCard
        role="alert"
        variant="warning"
        icon={<svg data-testid="icon" />}
        actions={<button type="button">Retry</button>}
        onDismiss={onDismiss}
      >
        Something needs attention
      </ToastCard>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("omits the controls column when neither actions nor dismiss are given", () => {
    render(<ToastCard>Plain message</ToastCard>);
    expect(screen.queryByLabelText("Dismiss")).toBeNull();
  });
});
