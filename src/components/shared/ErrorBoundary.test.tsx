import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { ERROR_BOUNDARY_MESSAGE } from "./error-copy";

let shouldThrow = false;

function ThrowingChild() {
  if (shouldThrow) throw new Error("Test error");
  return <div>Child rendered</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("Child rendered")).toBeDefined();
  });

  it("catches thrown errors and shows fallback UI", () => {
    shouldThrow = true;
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText(ERROR_BOUNDARY_MESSAGE)).toBeDefined();
    expect(screen.getByText("Try again")).toBeDefined();
  });

  it("recovers when retry button is clicked", () => {
    shouldThrow = true;
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeDefined();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try again"));
    expect(screen.getByText("Child rendered")).toBeDefined();
  });

  it("renders custom fallback when provided", () => {
    shouldThrow = true;
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).toBeDefined();
  });

  it("logs error and component stack to console", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    shouldThrow = true;
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );

    const caughtCall = errorSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("Caught error")
    );
    const stackCall = errorSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("Component stack")
    );
    expect(caughtCall).toBeDefined();
    expect(stackCall).toBeDefined();
  });
});
