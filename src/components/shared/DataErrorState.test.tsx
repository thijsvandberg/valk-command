import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DataErrorState, dataErrorMessage } from "./DataErrorState";
import { ApiError } from "@/lib/api-client";

describe("dataErrorMessage", () => {
  it("uses an Error's message", () => {
    expect(dataErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("uses an ApiError's message", () => {
    expect(dataErrorMessage(new ApiError(500, { error: "Server exploded" }))).toBe(
      "Server exploded",
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(dataErrorMessage(null)).toMatch(/something went wrong/i);
    expect(dataErrorMessage(undefined)).toMatch(/something went wrong/i);
    expect(dataErrorMessage({})).toMatch(/something went wrong/i);
  });
});

describe("DataErrorState", () => {
  it("renders an inline alert with the error message by default", () => {
    render(<DataErrorState error={new Error("network down")} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("network down");
  });

  it("renders a recoverable retry affordance inline", () => {
    const onRetry = vi.fn();
    render(<DataErrorState error={new Error("nope")} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders a full-view retry screen with a Try again button", () => {
    const onRetry = vi.fn();
    render(
      <DataErrorState
        variant="full"
        error={new Error("dead")}
        onRetry={onRetry}
        title="Couldn't load epics"
      />,
    );
    expect(screen.getByText("Couldn't load epics")).toBeInTheDocument();
    expect(screen.getByText("dead")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry affordance when no handler is given", () => {
    render(<DataErrorState error={new Error("x")} />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
