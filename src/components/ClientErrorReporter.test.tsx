// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const reportSpy = vi.fn();
vi.mock("@/lib/client-error", () => ({
  reportClientError: (...args: unknown[]) => reportSpy(...args),
}));

import { ClientErrorReporter } from "./ClientErrorReporter";

describe("ClientErrorReporter", () => {
  beforeEach(() => {
    reportSpy.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing", () => {
    const { container } = render(<ClientErrorReporter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("forwards a window error event", () => {
    render(<ClientErrorReporter />);

    const error = new Error("uncaught boom");
    window.dispatchEvent(new ErrorEvent("error", { error, message: "uncaught boom" }));

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const [context, forwarded, extra] = reportSpy.mock.calls[0];
    expect(context).toBe("window.onerror");
    expect(forwarded).toBe(error);
    expect(extra).toMatchObject({ source: "window.onerror" });
  });

  it("forwards an unhandled promise rejection", () => {
    render(<ClientErrorReporter />);

    const reason = new Error("rejected");
    // PromiseRejectionEvent is not constructable in jsdom; build a minimal event.
    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: reason, configurable: true });
    window.dispatchEvent(event);

    expect(reportSpy).toHaveBeenCalledTimes(1);
    const [context, forwarded, extra] = reportSpy.mock.calls[0];
    expect(context).toBe("unhandledrejection");
    expect(forwarded).toBe(reason);
    expect(extra).toMatchObject({ source: "unhandledrejection" });
  });

  it("removes its listeners on unmount", () => {
    const { unmount } = render(<ClientErrorReporter />);
    unmount();

    // A bare "error" Event (no `error`/`message` payload) does not trip jsdom's
    // uncaught-exception reporting; if the listener were still attached the spy
    // would fire, so its absence proves cleanup ran.
    window.dispatchEvent(new Event("error"));
    expect(reportSpy).not.toHaveBeenCalled();
  });
});
