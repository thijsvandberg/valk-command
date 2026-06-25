// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const reportSpy = vi.fn();
vi.mock("@/lib/client-error", () => ({
  reportClientError: (...args: unknown[]) => reportSpy(...args),
}));

import GlobalError from "./global-error";

describe("global-error boundary", () => {
  beforeEach(() => {
    reportSpy.mockClear();
    // GlobalError renders <html>/<body>, which React warns about when mounted
    // inside a div container; silence the expected nesting warning.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("forwards the error and digest to the sink", () => {
    const error = Object.assign(new Error("fatal"), { digest: "root-9" });
    render(<GlobalError error={error} reset={() => {}} />);

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const [context, forwarded, extra] = reportSpy.mock.calls[0];
    expect(context).toBe("global-error-boundary");
    expect(forwarded).toBe(error);
    expect(extra).toMatchObject({ digest: "root-9", source: "global-error-boundary" });
  });

  it("renders the digest so the user can copy it", () => {
    const error = Object.assign(new Error("fatal"), { digest: "root-9" });
    render(<GlobalError error={error} reset={() => {}} />);

    expect(screen.getByText("root-9")).toBeInTheDocument();
  });
});
