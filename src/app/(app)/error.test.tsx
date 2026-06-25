// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const reportSpy = vi.fn();
vi.mock("@/lib/client-error", () => ({
  reportClientError: (...args: unknown[]) => reportSpy(...args),
}));

import AppError from "./error";

describe("(app)/error boundary", () => {
  beforeEach(() => {
    reportSpy.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("forwards the error and digest to the sink", () => {
    const error = Object.assign(new Error("kaput"), { digest: "dig-123" });
    render(<AppError error={error} reset={() => {}} />);

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const [context, forwarded, extra] = reportSpy.mock.calls[0];
    expect(context).toBe("app-error-boundary");
    expect(forwarded).toBe(error);
    expect(extra).toMatchObject({ digest: "dig-123", source: "app-error-boundary" });
  });

  it("renders the digest so the user can copy it", () => {
    const error = Object.assign(new Error("kaput"), { digest: "dig-123" });
    render(<AppError error={error} reset={() => {}} />);

    expect(screen.getByText("dig-123")).toBeInTheDocument();
  });

  it("does not render a digest block when there is no digest", () => {
    render(<AppError error={new Error("kaput")} reset={() => {}} />);
    expect(screen.queryByText(/Copy/)).not.toBeInTheDocument();
  });
});
